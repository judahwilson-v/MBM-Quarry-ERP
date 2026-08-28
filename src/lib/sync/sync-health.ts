import type { PrismaClient } from "@prisma/client";
import { getDb } from "@/lib/prisma";
import { getCurrentLeaseHolder, type SyncLeaseHolder } from "./sync-lease";
import {
  AUDIT_ENTITY_ALIASES_REVERSE,
  DIRECT_PUSH_MODELS,
  PUSH_PRIORITY,
  SYNC_MODEL_CONFIG,
  type SyncModelName,
} from "./sync-config";
import { getDeliveryMode, type DeliveryMode } from "./delivery-gate";

export type SyncErrorCode =
  | "NETWORK"
  | "AUTH"
  | "CONSTRAINT"
  | "PAYLOAD"
  | "LEASE_BUSY"
  | "RESTORE_REFUSED"
  | "UNKNOWN";

/**
 * Typed, actionable user messages per error code.
 * Shown at API boundaries instead of raw stack traces.
 */
export const SYNC_ERROR_USER_MESSAGES: Record<SyncErrorCode, { title: string; action: string; severity: "warning" | "error" | "info" }> = {
  NETWORK: {
    title: "Network connection failed",
    action: "Check your internet connection and try again. If the problem persists, verify the server is reachable.",
    severity: "warning",
  },
  AUTH: {
    title: "Authentication error",
    action: "The sync credentials may have expired or are invalid. Restart the application or contact your administrator.",
    severity: "error",
  },
  CONSTRAINT: {
    title: "Data conflict detected",
    action: "A duplicate or missing parent record was encountered. Use 'Retry Outbox' to reattempt delivery, or export diagnostics for support.",
    severity: "warning",
  },
  PAYLOAD: {
    title: "Invalid data format",
    action: "A record contains unsupported or malformed data. Export diagnostics and contact support for assistance.",
    severity: "error",
  },
  LEASE_BUSY: {
    title: "Sync already in progress",
    action: "Another sync operation is currently running. Please wait for it to complete before retrying.",
    severity: "info",
  },
  RESTORE_REFUSED: {
    title: "Restore blocked",
    action: "There are unsynced local changes. Push your data first, then attempt the restore again.",
    severity: "warning",
  },
  UNKNOWN: {
    title: "Unexpected error",
    action: "An unclassified error occurred. Export diagnostics and contact support for investigation.",
    severity: "error",
  },
};

/**
 * Returns the user-facing action message for a given error code.
 * Safe for display at API boundaries — contains no secrets, stack traces, or PII.
 */
export function getUserActionMessage(code: SyncErrorCode): { title: string; action: string; severity: "warning" | "error" | "info" } {
  return SYNC_ERROR_USER_MESSAGES[code] ?? SYNC_ERROR_USER_MESSAGES.UNKNOWN;
}

export interface OutboxHealthSummary {
  total: number;
  pending: number;
  sending: number;
  acked: number;
  oldestPendingAgeMs: number | null;
  oldestPendingCreatedAt: string | null;
  retryDistribution: {
    attempts0: number;
    attempts1to3: number;
    attempts4plus: number;
  };
  lastDeliveredAt: string | null;
}

export interface RecentSyncError {
  eventId: string | null;
  entityType: string;
  entityId: string | null;
  code: SyncErrorCode;
  message: string;
  timestamp: string;
  attempts: number;
}

export interface ModelSyncHealth {
  name: SyncModelName;
  table: string;
  pendingLegacyCount: number;
  outboxPendingCount: number;
  outboxAckedCount: number;
  deliveryMode: DeliveryMode;
  status: "synced" | "pending" | "error";
}

export interface DetailedSyncHealth {
  overall: {
    status: "IDLE" | "ERROR" | "PARTIAL_SUCCESS" | "SYNCING";
    currentLeaseHolder: SyncLeaseHolder | null;
    lastPushedAt: string | null;
    lastPulledAt: string | null;
    lastOutboxDeliveredAt: string | null;
    totalPendingLegacy: number;
    totalPendingOutbox: number;
    totalPending: number;
    lastError: string | null;
  };
  outbox: OutboxHealthSummary;
  models: ModelSyncHealth[];
  recentErrors: RecentSyncError[];
  heldLogs: Array<{
    table: string;
    entityId: string;
    action: string;
    reason: string;
    createdAt: string;
  }>;
}

export function classifySyncMachineCode(errorText?: string | null): SyncErrorCode {
  if (!errorText) return "UNKNOWN";
  const lower = errorText.toLowerCase();
  if (
    lower.includes("network") ||
    lower.includes("econnrefused") ||
    lower.includes("fetch") ||
    lower.includes("enotfound") ||
    lower.includes("offline") ||
    lower.includes("timeout") ||
    lower.includes("etimedout")
  ) {
    return "NETWORK";
  }
  if (
    lower.includes("jwt") ||
    lower.includes("auth") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("apikey") ||
    lower.includes("bearer")
  ) {
    return "AUTH";
  }
  if (lower.includes("lease") || lower.includes("already in progress") || lower.includes("cannot acquire")) {
    return "LEASE_BUSY";
  }
  if (lower.includes("restore") || lower.includes("unsynced") || lower.includes("refused")) {
    return "RESTORE_REFUSED";
  }
  if (
    lower.includes("constraint") ||
    lower.includes("foreign key") ||
    lower.includes("23503") ||
    lower.includes("23505") ||
    lower.includes("unique") ||
    lower.includes("violates") ||
    lower.includes("is not present in table") ||
    lower.includes("not present")
  ) {
    return "CONSTRAINT";
  }
  if (
    lower.includes("payload") ||
    lower.includes("json") ||
    lower.includes("schema") ||
    lower.includes("invalid") ||
    lower.includes("unsupported field")
  ) {
    return "PAYLOAD";
  }
  return "UNKNOWN";
}

export function sanitizeErrorMessage(rawMessage?: string | null): string {
  if (!rawMessage) return "Unknown error occurred.";
  return rawMessage
    .replace(/postgresql:\/\/[^@]+@/g, "postgresql://[REDACTED]@")
    .replace(/bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/apikey=([^&\s]+)/gi, "apikey=[REDACTED]")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (match) => {
      // Retain first 4 chars of UUID for correlation
      return `${match.slice(0, 4)}...[UUID]`;
    })
    .slice(0, 300);
}

/**
 * Pure read-only status reader. Does NOT mutate sync_state, does NOT write
 * records, and does NOT advance cursors or trigger delivery.
 */
export async function getDetailedSyncHealth(
  dbParam?: PrismaClient,
  heldLogsFallback: Array<{ table: string; entityId: string; action: string; reason: string; createdAt: string }> = []
): Promise<DetailedSyncHealth> {
  const db = dbParam ?? (await getDb());

  // 1. Read sync_state purely (fallback to virtual object without creating in DB)
  const syncState = (await db.syncState.findUnique({ where: { id: "default" } })) ?? {
    id: "default",
    lastSyncedAt: new Date(0),
    status: "IDLE",
    lastError: null,
    updatedAt: new Date(0),
  };
  const pullState = await db.syncState.findUnique({ where: { id: "pull_state" } });
  const pushCursor = syncState.lastSyncedAt || new Date(0);

  // 2. Outbox counts and distribution
  const outboxEvents = await db.syncOutboxEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  let pendingOutboxCount = 0;
  let sendingOutboxCount = 0;
  let ackedOutboxCount = 0;
  let attempts0 = 0;
  let attempts1to3 = 0;
  let attempts4plus = 0;
  let oldestPendingCreatedAt: Date | null = null;
  let latestAckedDeliveredAt: Date | null = null;

  const perModelOutboxPending: Record<string, number> = {};
  const perModelOutboxAcked: Record<string, number> = {};
  const recentErrors: RecentSyncError[] = [];

  for (const event of outboxEvents) {
    if (event.status === "PENDING") {
      pendingOutboxCount++;
      perModelOutboxPending[event.entityType] = (perModelOutboxPending[event.entityType] || 0) + 1;
      if (!oldestPendingCreatedAt || event.createdAt < oldestPendingCreatedAt) {
        oldestPendingCreatedAt = event.createdAt;
      }
      if (event.attempts === 0) attempts0++;
      else if (event.attempts <= 3) attempts1to3++;
      else attempts4plus++;

      if (event.lastError && recentErrors.length < 20) {
        recentErrors.push({
          eventId: event.eventId,
          entityType: event.entityType,
          entityId: event.entityId,
          code: classifySyncMachineCode(event.lastError),
          message: sanitizeErrorMessage(event.lastError),
          timestamp: event.createdAt.toISOString(),
          attempts: event.attempts,
        });
      }
    } else if (event.status === "SENDING") {
      sendingOutboxCount++;
      perModelOutboxPending[event.entityType] = (perModelOutboxPending[event.entityType] || 0) + 1;
      if (!oldestPendingCreatedAt || event.createdAt < oldestPendingCreatedAt) {
        oldestPendingCreatedAt = event.createdAt;
      }
    } else if (event.status === "ACKED") {
      ackedOutboxCount++;
      perModelOutboxAcked[event.entityType] = (perModelOutboxAcked[event.entityType] || 0) + 1;
      if (event.deliveredAt) {
        if (!latestAckedDeliveredAt || event.deliveredAt > latestAckedDeliveredAt) {
          latestAckedDeliveredAt = event.deliveredAt;
        }
      }
    }
  }

  const oldestPendingAgeMs = oldestPendingCreatedAt ? Date.now() - oldestPendingCreatedAt.getTime() : null;

  // 3. Model Breakdown across all 29 models
  const sortedModels = Object.entries(PUSH_PRIORITY)
    .sort(([, a], [, b]) => a - b)
    .map(([name]) => name) as SyncModelName[];

  let totalPendingLegacy = 0;
  const models: ModelSyncHealth[] = [];

  for (const modelName of sortedModels) {
    const config = SYNC_MODEL_CONFIG[modelName];
    if (!config) continue;

    const aliasNames = AUDIT_ENTITY_ALIASES_REVERSE[modelName] || [];
    const allEntityNames = [modelName, ...aliasNames];
    let pendingLegacyCount = await db.auditLog.count({
      where: {
        entityName: { in: allEntityNames },
        createdAt: { gt: pushCursor },
      },
    });

    if (DIRECT_PUSH_MODELS.includes(modelName as any)) {
      try {
        const delegate = (db as any)[config.delegate];
        if (delegate) {
          const projectionCount = await delegate.count({
            where: { [config.timeField]: { gt: pushCursor } },
          });
          pendingLegacyCount = Math.max(pendingLegacyCount, projectionCount);
        }
      } catch {
        // Table or delegate may not exist in test mock
      }
    }

    const outboxPending = perModelOutboxPending[modelName] || 0;
    const outboxAcked = perModelOutboxAcked[modelName] || 0;

    totalPendingLegacy += pendingLegacyCount;

    models.push({
      name: modelName,
      table: config.table,
      pendingLegacyCount,
      outboxPendingCount: outboxPending,
      outboxAckedCount: outboxAcked,
      deliveryMode: getDeliveryMode(modelName),
      status: (pendingLegacyCount > 0 || outboxPending > 0) ? "pending" : "synced",
    });
  }

  // 4. Incorporate legacy sync errors if no outbox errors
  if (syncState.lastError && recentErrors.length === 0) {
    const errorStrings = syncState.lastError.split("; ");
    for (const errStr of errorStrings) {
      if (!errStr.trim()) continue;
      recentErrors.push({
        eventId: null,
        entityType: "legacy",
        entityId: null,
        code: classifySyncMachineCode(errStr),
        message: sanitizeErrorMessage(errStr),
        timestamp: syncState.updatedAt.toISOString(),
        attempts: 1,
      });
    }
  }

  const currentLeaseHolder = getCurrentLeaseHolder();
  const overallStatus =
    syncState.status === "SYNCING"
      ? ("SYNCING" as const)
      : recentErrors.length > 0 || syncState.lastError
      ? ("ERROR" as const)
      : totalPendingLegacy > 0 || pendingOutboxCount > 0
      ? ("PARTIAL_SUCCESS" as const)
      : ("IDLE" as const);

  return {
    overall: {
      status: overallStatus,
      currentLeaseHolder,
      lastPushedAt: syncState.lastSyncedAt?.toISOString() || null,
      lastPulledAt: pullState?.lastSyncedAt?.toISOString() || null,
      lastOutboxDeliveredAt: latestAckedDeliveredAt?.toISOString() || null,
      totalPendingLegacy,
      totalPendingOutbox: pendingOutboxCount + sendingOutboxCount,
      totalPending: totalPendingLegacy + pendingOutboxCount + sendingOutboxCount,
      lastError: syncState.lastError ? sanitizeErrorMessage(syncState.lastError) : null,
    },
    outbox: {
      total: outboxEvents.length,
      pending: pendingOutboxCount,
      sending: sendingOutboxCount,
      acked: ackedOutboxCount,
      oldestPendingAgeMs,
      oldestPendingCreatedAt: oldestPendingCreatedAt?.toISOString() || null,
      retryDistribution: {
        attempts0,
        attempts1to3,
        attempts4plus,
      },
      lastDeliveredAt: latestAckedDeliveredAt?.toISOString() || null,
    },
    models,
    recentErrors,
    heldLogs: heldLogsFallback,
  };
}
