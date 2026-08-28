"use server";

import { pushSync, pullSync, getSyncStatus } from "@/lib/sync/sync-service";
import { checkOnlineStatus } from "@/lib/sync/connectivity";
import { revalidatePath } from "next/cache";

export async function triggerSync() {
  const online = await checkOnlineStatus();
  if (!online) {
    return { pushed: 0, pulled: 0, skipped: 0, errors: [{ table: "network", error: "Offline" }], status: "ERROR" as const };
  }

  const pushResult = await pushSync();
  const pullResult = await pullSync();
  revalidatePath("/", "layout");

  const allErrors = [...(pushResult.errors || []), ...(pullResult.errors || [])];
  const combinedStatus: "IDLE" | "ERROR" | "PARTIAL_SUCCESS" =
    (pushResult.status === "ERROR" || pullResult.status === "ERROR")
      ? "ERROR"
      : (pushResult.status === "PARTIAL_SUCCESS" || pullResult.status === "PARTIAL_SUCCESS")
      ? "PARTIAL_SUCCESS"
      : "IDLE";

  return {
    pushed: pushResult.pushed,
    pulled: pullResult.pulled,
    skipped: (pushResult.skipped || 0) + (pullResult.skipped || 0),
    errors: allErrors,
    status: combinedStatus,
  };
}

export async function fetchSyncStatus() {
  return await getSyncStatus();
}

export async function fetchOnlineStatus() {
  return await checkOnlineStatus();
}

export async function fetchDetailedSyncStatus() {
  const { getDetailedSyncStatus } = await import("@/lib/sync/sync-service");
  return getDetailedSyncStatus();
}

export async function forcePushSync() {
  const { pushSync } = await import("@/lib/sync/sync-service");
  const result = await pushSync();
  revalidatePath("/", "layout");
  return result;
}

export async function forcePullSync() {
  const { pullSync } = await import("@/lib/sync/sync-service");
  const result = await pullSync();
  revalidatePath("/", "layout");
  return result;
}

export async function resetSyncCursor() {
  return {
    success: false,
    code: "RETIRED_OPERATION" as const,
    error: "resetSyncCursor has been retired. Rewinding the sync cursor causes duplicate re-pushes and collision merge suffixes (Merge XXXX).",
    safeReplacement: "getDetailedSyncHealth",
  };
}

export async function checkRestoreEligibility() {
  const { checkRestoreEligibility: check } = await import("@/lib/sync/sync-service");
  return check();
}

export async function performFullRestore(options?: { force?: boolean; acknowledgeUnsynced?: boolean }) {
  const { fullRestoreFromSupabase } = await import("@/lib/sync/sync-service");
  const result = await fullRestoreFromSupabase(options);
  revalidatePath("/", "layout");
  return result;
}

export async function fetchRestoreDiffSummary() {
  const { generateRestoreDiffSummary } = await import("@/lib/sync/diff-service");
  return generateRestoreDiffSummary();
}

export async function fetchDetailedTableDiff(tableName: string) {
  const { getDetailedTableDiff } = await import("@/lib/sync/diff-service");
  return getDetailedTableDiff(tableName);
}

export async function performForcePushAll() {
  return {
    success: false,
    code: "RETIRED_OPERATION" as const,
    error: "forcePushAllTables has been retired. Unsafe table-wide force-push overwrites event tracking. Use 'Retry Outbox' or staged restore instead.",
    safeReplacement: "retryOutboxDelivery",
  };
}

export async function retryOutboxDelivery() {
  const { getCurrentLeaseHolder } = await import("@/lib/sync/sync-lease");
  const currentLease = getCurrentLeaseHolder();
  if (currentLease) {
    return { success: false, reason: `Sync lease busy: "${currentLease}" is currently running.` };
  }
  const { deliverPendingOutbox } = await import("@/lib/sync/outbox");
  const result = await deliverPendingOutbox();
  revalidatePath("/", "layout");
  return { success: true, ...result };
}

export async function exportSyncDiagnostics() {
  const { getDetailedSyncHealth, getUserActionMessage } = await import("@/lib/sync/sync-health");
  const { getCutoverManifestSummary } = await import("@/lib/sync/cutover-manifest");
  const { ALL_MIGRATIONS } = await import("@/lib/migrations");
  const fs = await import("fs");
  const path = await import("path");

  const health = await getDetailedSyncHealth();
  const cutoverSummary = getCutoverManifestSummary();

  // App version
  let appVersion = "unknown";
  try {
    const versionPath = path.join(process.cwd(), "VERSION");
    if (fs.existsSync(versionPath)) {
      appVersion = fs.readFileSync(versionPath, "utf8").trim();
    } else {
      const pkgPath = path.join(process.cwd(), "package.json");
      if (fs.existsSync(pkgPath)) {
        appVersion = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version || "unknown";
      }
    }
  } catch {}

  // Release manifest checksums (safe — no secrets, only hashes)
  let releaseManifest: Record<string, unknown> | null = null;
  try {
    const manifestPath = path.join(process.cwd(), "supabase", "release-manifest.json");
    if (fs.existsSync(manifestPath)) {
      releaseManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    }
  } catch {}

  // Restore journal state (safe — only phase and paths, no data)
  let restoreJournalState: { exists: boolean; phase?: string } = { exists: false };
  try {
    const { getDatabaseFilePath } = await import("@/lib/prisma");
    const dbPath = getDatabaseFilePath();
    const journalPath = `${dbPath}.restore-journal.json`;
    if (fs.existsSync(journalPath)) {
      const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
      restoreJournalState = { exists: true, phase: journal.phase };
    }
  } catch {}

  // Error summaries with typed user-facing actions (no raw messages in export)
  const typedErrors = health.recentErrors.map((err) => {
    const userMsg = getUserActionMessage(err.code);
    return {
      code: err.code,
      entityType: err.entityType,
      title: userMsg.title,
      action: userMsg.action,
      severity: userMsg.severity,
      attempts: err.attempts,
      timestamp: err.timestamp,
      // Redacted message (sanitized in sync-health already, but re-confirm)
      redactedMessage: err.message,
    };
  });

  return {
    appVersion,
    migrationVersion: ALL_MIGRATIONS.length,
    migrationNames: ALL_MIGRATIONS.map((m) => ({ version: m.version, id: m.id })),
    releaseManifest,
    restoreJournalState,
    syncHealth: {
      overall: health.overall,
      outbox: health.outbox,
      // Model breakdown: counts and delivery mode only, no payload bodies
      models: health.models.map((m) => ({
        name: m.name,
        table: m.table,
        pendingLegacyCount: m.pendingLegacyCount,
        outboxPendingCount: m.outboxPendingCount,
        outboxAckedCount: m.outboxAckedCount,
        deliveryMode: m.deliveryMode,
        status: m.status,
      })),
      heldLogsCount: health.heldLogs.length,
    },
    typedErrors,
    cutoverSummary,
    timestamp: new Date().toISOString(),
    // Explicit omission notice
    _omitted: [
      "payload bodies",
      "credentials and access tokens",
      "admin/delete PINs",
      "personal/business data",
      "raw stack traces",
      "full UUIDs (truncated to 4 chars)",
    ],
  };
}
