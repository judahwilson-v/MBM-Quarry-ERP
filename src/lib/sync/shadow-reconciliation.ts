/**
 * Shadow Reconciliation — Phase 6 Checkpoint 4
 *
 * For each CUTOVER_READY domain, compares the local outbox state and local
 * entity data against cloud state to produce a mismatch report. This is a
 * pure read-only operation that never mutates local or cloud data.
 *
 * Mismatch categories:
 *   EXPECTED_LEGACY  — Row exists on cloud from legacy push but not in outbox (normal during transition)
 *   PENDING_OUTBOX   — Row has a PENDING outbox event not yet delivered
 *   CONFLICT         — Row exists in both but scalar hash differs (e.g. concurrent edits)
 *   SCHEMA_DEVIATION — Row has extra/missing columns between local and cloud
 *   STUCK_EVENT      — Outbox event with 4+ attempts and no ACK
 *   DEFECT           — Unexplained mismatch (requires investigation)
 */

import type { PrismaClient } from "@prisma/client";
import { getDb } from "@/lib/prisma";
import { createSyncClient } from "@/lib/supabase/client-sync";
import { SYNC_MODEL_CONFIG, type SyncModelName } from "./sync-config";
import { CUTOVER_MODEL_MANIFEST, type ModelCutoverEntry } from "./cutover-manifest";
import { createHash } from "crypto";
import SYNC_MAP from "./sync-map.json";

export type MismatchCategory =
  | "EXPECTED_LEGACY"
  | "PENDING_OUTBOX"
  | "CONFLICT"
  | "SCHEMA_DEVIATION"
  | "STUCK_EVENT"
  | "DEFECT";

export interface ReconciliationMismatch {
  entityId: string;
  category: MismatchCategory;
  detail: string;
}

export interface DomainReconciliationResult {
  modelName: SyncModelName;
  tableName: string;
  localCount: number;
  cloudCount: number;
  outboxPending: number;
  outboxStuck: number;
  outboxAcked: number;
  mismatches: ReconciliationMismatch[];
  reconciled: boolean; // true = zero unexplained mismatches and zero stuck events
}

export interface ReconciliationReport {
  timestamp: string;
  domains: DomainReconciliationResult[];
  allReconciled: boolean;
  summary: {
    totalDomains: number;
    reconciledDomains: number;
    totalMismatches: number;
    totalStuckEvents: number;
    byCategory: Record<MismatchCategory, number>;
  };
}

/**
 * Compute a deterministic hash of the scalar values in a row for comparison.
 * Ignores key ordering, normalizes dates, and skips relation fields.
 */
function scalarHash(row: Record<string, unknown>, mapping: Record<string, string>): string {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    // Use the DB column name as the canonical key
    const canonicalKey = mapping[key] ?? key;
    if (value instanceof Date) {
      normalized[canonicalKey] = value.toISOString();
    } else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      // Normalize ISO date strings
      try {
        normalized[canonicalKey] = new Date(value).toISOString();
      } catch {
        normalized[canonicalKey] = value;
      }
    } else {
      normalized[canonicalKey] = value;
    }
  }
  const sorted = Object.keys(normalized).sort().map((k) => `${k}:${JSON.stringify(normalized[k])}`).join("|");
  return createHash("sha256").update(sorted).digest("hex").slice(0, 16);
}

/**
 * Run shadow reconciliation for all CUTOVER_READY domains.
 * Pure read-only: does not mutate local DB or Supabase.
 */
export async function runShadowReconciliation(
  dbParam?: PrismaClient,
): Promise<ReconciliationReport> {
  const db = dbParam ?? (await getDb());
  const supabase = createSyncClient();

  const cutoverReadyModels = Object.values(CUTOVER_MODEL_MANIFEST).filter(
    (m): m is ModelCutoverEntry & { cutoverReady: true } => m.cutoverReady && m.outboxStatus === "MIGRATED"
  );

  const domains: DomainReconciliationResult[] = [];

  for (const manifest of cutoverReadyModels) {
    const config = SYNC_MODEL_CONFIG[manifest.modelName];
    if (!config) continue;

    const mapping = (SYNC_MAP as Record<string, Record<string, string>>)[manifest.modelName] ?? {};
    const reverseMapping: Record<string, string> = {};
    for (const [camel, db_col] of Object.entries(mapping)) {
      reverseMapping[db_col] = camel;
    }

    const mismatches: ReconciliationMismatch[] = [];

    // 1. Get local rows
    const delegate = (db as any)[config.delegate];
    let localRows: Record<string, unknown>[] = [];
    try {
      localRows = await delegate.findMany();
    } catch {
      mismatches.push({ entityId: "*", category: "DEFECT", detail: `Failed to read local table ${config.table}` });
    }

    const localById = new Map<string, Record<string, unknown>>();
    for (const row of localRows) {
      localById.set(String((row as any).id), row);
    }

    // 2. Get cloud rows
    let cloudRows: Record<string, unknown>[] = [];
    try {
      const { data, error } = await supabase
        .from(config.table)
        .select("*")
        .order("id", { ascending: true });
      if (error) {
        mismatches.push({ entityId: "*", category: "DEFECT", detail: `Failed to read cloud table ${config.table}: ${error.message}` });
      } else {
        cloudRows = data ?? [];
      }
    } catch (err: any) {
      mismatches.push({ entityId: "*", category: "DEFECT", detail: `Cloud fetch exception for ${config.table}: ${err?.message}` });
    }

    const cloudById = new Map<string, Record<string, unknown>>();
    for (const row of cloudRows) {
      cloudById.set(String((row as any).id), row);
    }

    // 3. Get outbox events for this entity type
    const outboxEvents = await db.syncOutboxEvent.findMany({
      where: { entityType: manifest.modelName },
    });

    const pendingEntityIds = new Set<string>();
    let outboxPending = 0;
    let outboxStuck = 0;
    let outboxAcked = 0;

    for (const event of outboxEvents) {
      if (event.status === "ACKED") {
        outboxAcked++;
      } else if (event.status === "PENDING" || event.status === "SENDING") {
        outboxPending++;
        pendingEntityIds.add(event.entityId);
        if (event.attempts >= 4) {
          outboxStuck++;
          mismatches.push({
            entityId: event.entityId,
            category: "STUCK_EVENT",
            detail: `Outbox event ${event.eventId} has ${event.attempts} attempts without ACK. Last error: ${event.lastError ?? "none"}`,
          });
        }
      }
    }

    // 4. Compare local vs cloud
    // 4a. Local-only rows (exist locally but not on cloud)
    for (const [id, localRow] of localById.entries()) {
      if (!cloudById.has(id)) {
        if (pendingEntityIds.has(id)) {
          mismatches.push({
            entityId: id,
            category: "PENDING_OUTBOX",
            detail: `Row exists locally but not on cloud — pending outbox delivery`,
          });
        } else {
          // Could be a freshly created row not yet synced, or a defect
          mismatches.push({
            entityId: id,
            category: "DEFECT",
            detail: `Row exists locally but not on cloud, and has no pending outbox event`,
          });
        }
      }
    }

    // 4b. Cloud-only rows (exist on cloud but not locally)
    for (const [id] of cloudById.entries()) {
      if (!localById.has(id)) {
        mismatches.push({
          entityId: id,
          category: "EXPECTED_LEGACY",
          detail: `Row exists on cloud but not locally — likely legacy push from another device or deleted locally`,
        });
      }
    }

    // 4c. Both exist — compare scalar hash
    for (const [id, localRow] of localById.entries()) {
      const cloudRow = cloudById.get(id);
      if (!cloudRow) continue; // Already handled in 4a

      if (pendingEntityIds.has(id)) {
        // Row has a pending update; difference is expected
        continue;
      }

      const localHash = scalarHash(localRow, mapping);
      const cloudHash = scalarHash(cloudRow, {});
      if (localHash !== cloudHash) {
        // Check if it's a schema deviation (different number of keys) or a value conflict
        const localKeys = new Set(Object.keys(localRow).map((k) => mapping[k] ?? k));
        const cloudKeys = new Set(Object.keys(cloudRow));

        const extraLocal = [...localKeys].filter((k) => !cloudKeys.has(k));
        const extraCloud = [...cloudKeys].filter((k) => !localKeys.has(k));

        if (extraLocal.length > 0 || extraCloud.length > 0) {
          mismatches.push({
            entityId: id,
            category: "SCHEMA_DEVIATION",
            detail: `Column difference — local extra: [${extraLocal.join(", ")}], cloud extra: [${extraCloud.join(", ")}]`,
          });
        } else {
          mismatches.push({
            entityId: id,
            category: "CONFLICT",
            detail: `Scalar values differ between local (hash ${localHash}) and cloud (hash ${cloudHash})`,
          });
        }
      }
    }

    // Determine reconciliation status: zero DEFECT + zero STUCK_EVENT = reconciled
    const hasUnexplained = mismatches.some((m) => m.category === "DEFECT" || m.category === "STUCK_EVENT");
    const reconciled = !hasUnexplained;

    domains.push({
      modelName: manifest.modelName,
      tableName: config.table,
      localCount: localRows.length,
      cloudCount: cloudRows.length,
      outboxPending,
      outboxStuck,
      outboxAcked,
      mismatches,
      reconciled,
    });
  }

  // Summary
  const byCategory: Record<MismatchCategory, number> = {
    EXPECTED_LEGACY: 0,
    PENDING_OUTBOX: 0,
    CONFLICT: 0,
    SCHEMA_DEVIATION: 0,
    STUCK_EVENT: 0,
    DEFECT: 0,
  };
  let totalMismatches = 0;
  let totalStuckEvents = 0;
  for (const d of domains) {
    for (const m of d.mismatches) {
      byCategory[m.category]++;
      totalMismatches++;
    }
    totalStuckEvents += d.outboxStuck;
  }

  const allReconciled = domains.every((d) => d.reconciled);

  return {
    timestamp: new Date().toISOString(),
    domains,
    allReconciled,
    summary: {
      totalDomains: domains.length,
      reconciledDomains: domains.filter((d) => d.reconciled).length,
      totalMismatches,
      totalStuckEvents,
      byCategory,
    },
  };
}

/**
 * Mark a domain as CUTOVER_READY in the manifest if reconciliation passes.
 * This is a validation gate, not a data mutation — it checks the manifest
 * and returns whether the domain can proceed.
 */
export function validateCutoverReadiness(
  report: ReconciliationReport,
  modelName: SyncModelName,
): { ready: boolean; reason: string } {
  const domain = report.domains.find((d) => d.modelName === modelName);
  if (!domain) {
    return { ready: false, reason: `Model "${modelName}" not found in reconciliation report` };
  }
  if (!domain.reconciled) {
    const defects = domain.mismatches.filter((m) => m.category === "DEFECT" || m.category === "STUCK_EVENT");
    return {
      ready: false,
      reason: `${defects.length} unexplained mismatch(es) or stuck event(s) for ${modelName}: ${defects.map((d) => `[${d.category}] ${d.entityId}: ${d.detail}`).join("; ")}`,
    };
  }
  return { ready: true, reason: `${modelName} passed reconciliation with zero unexplained mismatches` };
}
