import { getDb } from "@/lib/prisma";
import { createSyncClient } from "@/lib/supabase/client-sync";
import {
  AUDIT_ENTITY_ALIASES_REVERSE,
  DIRECT_PUSH_MODELS,
  extractEntityData,
  getRowTimestamp,
  PULL_ORDER,
  PUSH_PRIORITY,
  resolveSyncModel,
  SYNC_MODEL_CONFIG,
} from "./sync-config";

import SYNC_MAP from "./sync-map.json";
import { stagedRestoreFromSupabase, type StagedRestoreOptions } from "./staged-restore";
import { withSyncLease } from "./sync-lease";
import { getDetailedSyncHealth } from "./sync-health";
import { isLegacyPushMutationEnabled, isLegacyPullRowCopyEnabled } from "./delivery-gate";

// In-memory store for the last held logs from pushSync (used by getDetailedSyncStatus)
let _lastHeldLogs: Array<{table: string; entityId: string; action: string; reason: string; createdAt: string}> = [];

// Build global bidirectional maps from the generated schema metadata
const CAMEL_TO_DB: Record<string, string> = {};
const DB_TO_CAMEL: Record<string, string> = {};

for (const model of Object.values(SYNC_MAP)) {
  for (const [camel, db] of Object.entries(model as Record<string, string>)) {
    CAMEL_TO_DB[camel] = db;
    DB_TO_CAMEL[db] = camel;
  }
}

// Convert camelCase object keys to database columns for Supabase REST API
function toSnakeCase(obj: any): any {
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => toSnakeCase(v));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      // Use exact schema mapping, fallback to naive regex only for unknown arbitrary keys
      const snakeKey = CAMEL_TO_DB[key] ?? key.replace(/([A-Z])/g, "_$1").toLowerCase();
      result[snakeKey] = toSnakeCase(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
}

// Convert database columns to camelCase for Prisma
function toCamelCase(obj: any): any {
  if (obj instanceof Date) {
    return obj;
  }
  if (typeof obj === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/i.test(obj)) {
    const hasTz = /Z|[+-]\d{2}:\d{2}$/i.test(obj);
    const parsedDate = new Date(hasTz ? obj : obj + 'Z');
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => toCamelCase(v));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = DB_TO_CAMEL[key] ?? key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      result[camelKey] = toCamelCase(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
}

export interface SyncErrorItem {
  table: string;
  rowId?: string;
  error: string;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  skipped: number;
  errors: SyncErrorItem[];
  status: "IDLE" | "ERROR" | "PARTIAL_SUCCESS";
}

export async function pushSync(): Promise<SyncResult> {
  return withSyncLease("push", async () => {
    let pushedCount = 0;
    const pulledCount = 0;
    let skippedCount = 0;
    const errorsList: SyncErrorItem[] = [];

    const db = await getDb();
    const supabase = createSyncClient();

    try {
      // 1. Get sync state
      let syncState = await db.syncState.findUnique({ where: { id: "default" } });
      if (!syncState) {
        syncState = await db.syncState.create({
          data: { id: "default", lastSyncedAt: new Date(0) }
        });
      }

      // 2. Fetch new audit logs since last sync
      let unsyncedLogs: any[] = [];
      try {
        unsyncedLogs = await db.auditLog.findMany({
          where: { createdAt: { gt: syncState.lastSyncedAt } },
          orderBy: { createdAt: 'asc' }
        });
      } catch (fetchErr: any) {
        console.error("[Sync Push] Failed to fetch audit logs:", fetchErr);
        errorsList.push({ table: "audit_logs", error: fetchErr?.message || String(fetchErr) });
      }

      // Sort by dependency order: parent entities first, then by time
      unsyncedLogs.sort((a, b) => {
        const aModel = resolveSyncModel(a.entityName);
        const bModel = resolveSyncModel(b.entityName);
        const aPri = aModel ? (PUSH_PRIORITY[aModel] ?? 99) : 99;
        const bPri = bModel ? (PUSH_PRIORITY[bModel] ?? 99) : 99;
        if (aPri !== bPri) return aPri - bPri;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      let lastProcessedTime = syncState.lastSyncedAt;
      const heldLogs: any[] = [];
      let earliestSkippedTime: Date | null = null;

      const recordSkippedTime = (date: Date) => {
        if (!earliestSkippedTime || date < earliestSkippedTime) {
          earliestSkippedTime = date;
        }
      };

      await db.syncState.update({ where: { id: "default" }, data: { status: "SYNCING" } });

      for (const log of unsyncedLogs) {
        const modelName = resolveSyncModel(log.entityName);
        const config = modelName ? SYNC_MODEL_CONFIG[modelName] : null;

        if (!config) {
          if (log.createdAt > lastProcessedTime) lastProcessedTime = log.createdAt;
          continue;
        }

        try {
          if (modelName && !isLegacyPushMutationEnabled(modelName)) {
            // Cut-over model: do not mutate the cloud business table via legacy push.
            // Push the audit log trail only, without modifying the entity table or collision renaming.
            try {
              const { error: auditError } = await supabase.from("audit_logs").upsert(toSnakeCase(log));
              if (auditError) {
                console.warn(`[Sync Push] Audit log push failed for cut-over model ${modelName}:${log.id}: ${auditError.message}`);
              }
            } catch (auditErr: any) {
              console.warn(`[Sync Push] Audit log push exception for cut-over model:`, auditErr);
            }
            if (log.createdAt > lastProcessedTime) {
              lastProcessedTime = log.createdAt;
            }
            pushedCount++;
            continue;
          }

          if (log.action === "delete") {
            console.log(`[Sync Push] Deleting ${config.table}:${log.entityId}`);
            const { error } = await supabase.from(config.table).delete().eq("id", log.entityId);
            if (error) {
              if (error.code === '23503' || error.message?.includes('foreign key')) {
                console.warn(`[Sync Push] Holding delete ${config.table}:${log.entityId} (FK dep, will retry)`);
                heldLogs.push(log);
                continue;
              }
              throw new Error(`[Sync Push] Delete failed for ${config.table}:${log.entityId}: ${error.message}`);
            }
          } else if ((log.action === "create" || log.action === "update") && log.payload) {
            let entityData: any;
            try {
              entityData = extractEntityData(JSON.parse(log.payload));
            } catch (jsonErr: any) {
              console.error(`[Sync Push] JSON parse failed for log ${log.id} (${config.table}:${log.entityId}):`, jsonErr);
              errorsList.push({ table: config.table, rowId: log.entityId, error: `JSON parse error: ${jsonErr?.message || jsonErr}` });
              skippedCount++;
              recordSkippedTime(log.createdAt);
              if (log.createdAt > lastProcessedTime) lastProcessedTime = log.createdAt;
              continue;
            }

            const snakeData = toSnakeCase(entityData);
            console.log(`[Sync Push] Upserting ${config.table}:${String(snakeData.id ?? log.entityId)}`);
            const { error } = await supabase.from(config.table).upsert(snakeData, { onConflict: 'id' });
            if (error) {
              if (error.code === '23503' || error.message?.includes('foreign key')) {
                console.warn(`[Sync Push] Holding ${config.table}:${log.entityId} (FK dep missing, will retry)`);
                heldLogs.push(log);
                continue;
              }
              if (error.code === '23505') {
                console.warn(`[Sync Push] Unique constraint violation on ${config.table}:${log.entityId}. Resolving...`);
                if (config.table === 'parties' && snakeData.party_name) {
                  snakeData.party_name = `${snakeData.party_name} (Merge ${log.entityId.slice(-4)})`;
                } else if (config.table === 'vehicles' && snakeData.vehicle_number) {
                  snakeData.vehicle_number = `${snakeData.vehicle_number} (Merge ${log.entityId.slice(-4)})`;
                } else if (config.table === 'suppliers' && snakeData.supplier_name) {
                  snakeData.supplier_name = `${snakeData.supplier_name} (Merge ${log.entityId.slice(-4)})`;
                } else if (config.table === 'employees' && snakeData.name) {
                  snakeData.name = `${snakeData.name} (Merge ${log.entityId.slice(-4)})`;
                } else if (config.table === 'materials' && snakeData.material_name) {
                  snakeData.material_name = `${snakeData.material_name} (Merge ${log.entityId.slice(-4)})`;
                } else if (config.table === 'weighbridge_tickets' && snakeData.ticket_number !== undefined && snakeData.ticket_number !== null) {
                  const currentNum = typeof snakeData.ticket_number === 'number' ? snakeData.ticket_number : (parseInt(String(snakeData.ticket_number), 10) || 0);
                  snakeData.ticket_number = currentNum + 900000;
                } else if (config.table === 'outgoing_sales' && snakeData.serial_number) {
                  snakeData.serial_number = null; // Drop conflicting auto-number
                }
                const { error: retryError } = await supabase.from(config.table).upsert(snakeData, { onConflict: 'id' });
                if (retryError) {
                  throw new Error(`[Sync Push] Upsert retry failed for ${config.table}:${log.entityId}: ${retryError.message}`);
                }
              } else {
                throw new Error(`[Sync Push] Upsert failed for ${config.table}:${log.entityId}: ${error.message}`);
              }
            }
          }

          // Push the audit log itself to Supabase so other PCs know about deletions
          try {
            const { error: auditError } = await supabase.from("audit_logs").upsert(toSnakeCase(log));
            if (auditError) {
              console.warn(`[Sync Push] Audit log push failed for ${log.id}: ${auditError.message}`);
            }
          } catch (auditErr: any) {
            console.warn(`[Sync Push] Audit log push exception:`, auditErr);
          }

          if (log.createdAt > lastProcessedTime) {
            lastProcessedTime = log.createdAt;
          }
          pushedCount++;
        } catch (rowErr: any) {
          const errorMsg = rowErr?.message || String(rowErr);
          console.error(`[Sync Push] Row push failed for ${config?.table || log.entityName}:${log.entityId}:`, errorMsg);
          errorsList.push({
            table: config?.table || log.entityName,
            rowId: log.entityId,
            error: errorMsg,
          });
          skippedCount++;
          recordSkippedTime(log.createdAt);
          if (log.createdAt > lastProcessedTime) {
            lastProcessedTime = log.createdAt;
          }
        }
      }

      // FK Holding Queue Retry Pass (up to 3 passes for held logs)
      let currentHeld = [...heldLogs];
      let retryPass = 0;
      while (currentHeld.length > 0 && retryPass < 3) {
        retryPass++;
        console.log(`[Sync Push] Retrying ${currentHeld.length} held logs (pass ${retryPass})...`);
        const nextHeld: any[] = [];
        for (const log of currentHeld) {
          const modelName = resolveSyncModel(log.entityName);
          const config = modelName ? SYNC_MODEL_CONFIG[modelName] : null;
          if (!config) continue;
          try {
            if (log.action === "delete") {
              const { error } = await supabase.from(config.table).delete().eq("id", log.entityId);
              if (error) {
                if (error.code === '23503' || error.message?.includes('foreign key')) {
                  nextHeld.push(log);
                  continue;
                }
                throw new Error(`Delete failed for ${config.table}:${log.entityId}: ${error.message}`);
              }
            } else if ((log.action === "create" || log.action === "update") && log.payload) {
              const entityData = extractEntityData(JSON.parse(log.payload));
              const snakeData = toSnakeCase(entityData);
              const { error } = await supabase.from(config.table).upsert(snakeData, { onConflict: 'id' });
              if (error) {
                if (error.code === '23503' || error.message?.includes('foreign key')) {
                  nextHeld.push(log);
                  continue;
                }
                throw new Error(`Upsert failed for ${config.table}:${log.entityId}: ${error.message}`);
              }
            }
            try {
              await supabase.from("audit_logs").upsert(toSnakeCase(log));
            } catch {}
            pushedCount++;
            if (log.createdAt > lastProcessedTime) {
              lastProcessedTime = log.createdAt;
            }
          } catch (retryErr: any) {
            console.warn(`[Sync Push] Held log retry failed for ${config.table}:${log.entityId}:`, retryErr?.message);
            nextHeld.push(log);
          }
        }
        currentHeld = nextHeld;
      }

      if (currentHeld.length > 0) {
        skippedCount += currentHeld.length;
        for (const heldLog of currentHeld) {
          if (heldLog.createdAt > lastProcessedTime) {
            lastProcessedTime = heldLog.createdAt;
          }
        }
        console.warn(`[Sync Push] ${currentHeld.length} logs remain held due to missing parent foreign keys. Cursor will advance past them to prevent deadlock.`);

        _lastHeldLogs = currentHeld.map((log: any) => {
          const heldModelName = resolveSyncModel(log.entityName);
          const heldConfig = heldModelName ? SYNC_MODEL_CONFIG[heldModelName] : null;
          return {
            table: heldConfig?.table || log.entityName,
            entityId: log.entityId,
            action: log.action,
            reason: `Missing parent FK — parent record not found in Supabase`,
            createdAt: log.createdAt?.toISOString?.() || String(log.createdAt),
          };
        });
      } else {
        _lastHeldLogs = [];
      }

      // Event, ledger, and inventory projections
      for (const modelName of DIRECT_PUSH_MODELS) {
        if (!isLegacyPushMutationEnabled(modelName)) continue;
        const config = SYNC_MODEL_CONFIG[modelName];
        if (!config) continue;
        try {
          const delegate = (db as any)[config.delegate];
          const rows = await delegate.findMany({
            where: { [config.timeField]: { gt: syncState.lastSyncedAt } },
            orderBy: { [config.timeField]: "asc" },
          });

          for (const row of rows as Record<string, unknown>[]) {
            try {
              const snakeData = toSnakeCase(row);
              console.log(`[Sync Push] Upserting projection ${config.table}:${String(snakeData.id)}`);
              const { error } = await supabase
                .from(config.table)
                .upsert(snakeData, { onConflict: 'id' });
              if (error) {
                throw new Error(`[Sync Push] Projection upsert failed for ${config.table}:${String(snakeData.id)}: ${error.message}`);
              }
              const rowDate = getRowTimestamp(row, config.timeField);
              if (rowDate > lastProcessedTime) lastProcessedTime = rowDate;
              pushedCount++;
            } catch (projRowErr: any) {
              const errorMsg = projRowErr?.message || String(projRowErr);
              console.error(`[Sync Push] Projection row push failed for ${config.table}:${String((row as any).id)}:`, errorMsg);
              errorsList.push({
                table: config.table,
                rowId: String((row as any).id),
                error: errorMsg,
              });
              skippedCount++;
              const rowDate = getRowTimestamp(row, config.timeField);
              recordSkippedTime(rowDate);
              if (rowDate > lastProcessedTime) lastProcessedTime = rowDate;
            }
          }
        } catch (projModelErr: any) {
          console.error(`[Sync Push] Projection model fetch/push failed for ${config.table}:`, projModelErr);
          errorsList.push({
            table: config.table,
            error: projModelErr?.message || String(projModelErr),
          });
        }
      }

      const finalStatus: "IDLE" | "ERROR" | "PARTIAL_SUCCESS" =
        errorsList.length === 0 ? "IDLE" : (pushedCount > 0 ? "PARTIAL_SUCCESS" : "ERROR");
      const lastErrorMessage = errorsList.length > 0 ? errorsList.map(e => `${e.table}${e.rowId ? `:${e.rowId}` : ''}: ${e.error}`).join("; ") : null;

      const SAFETY_WINDOW_MS = 0;
      let finalPushCursor = syncState.lastSyncedAt;

      if (lastProcessedTime > syncState.lastSyncedAt) {
        finalPushCursor = new Date(Math.max(syncState.lastSyncedAt.getTime(), lastProcessedTime.getTime() - SAFETY_WINDOW_MS));
      }

      if (earliestSkippedTime) {
        const maxAllowedCursor = new Date(Math.max(0, (earliestSkippedTime as Date).getTime() - 1));
        if (maxAllowedCursor < finalPushCursor) {
          finalPushCursor = maxAllowedCursor;
        }
      }

      await db.syncState.update({
        where: { id: "default" },
        data: {
          lastSyncedAt: finalPushCursor,
          status: finalStatus === "IDLE" ? "IDLE" : finalStatus,
          lastError: lastErrorMessage,
        }
      });

      purgeOldSupabaseData().catch((e) =>
        console.warn("[Retention] Background purge failed:", e?.message)
      );

      return {
        pushed: pushedCount,
        pulled: pulledCount,
        skipped: skippedCount,
        errors: errorsList,
        status: finalStatus,
      };
    } catch (e: any) {
      const topErrorMsg = e?.message || String(e);
      console.error(`[Sync Push] Top-level error:`, topErrorMsg);
      errorsList.push({ table: "global", error: topErrorMsg });

      try {
        await db.syncState.update({
          where: { id: "default" },
          data: { status: "ERROR", lastError: topErrorMsg }
        });
      } catch (dbErr) {
        console.error("[Sync Push] Failed to update syncState on error:", dbErr);
      }

      return {
        pushed: pushedCount,
        pulled: pulledCount,
        skipped: skippedCount,
        errors: errorsList,
        status: "ERROR",
      };
    }
  });
}

export async function pullSync(): Promise<SyncResult> {
  return withSyncLease("pull", async () => {
    const pushedCount = 0;
    let pulledCount = 0;
    let skippedCount = 0;
    const errorsList: SyncErrorItem[] = [];

    const db = await getDb();
    const supabase = createSyncClient();

    try {
      // 1. Get pull state
      let pullState = await db.syncState.findUnique({ where: { id: "pull_state" } });
      if (!pullState) {
        pullState = await db.syncState.create({
          data: { id: "pull_state", lastSyncedAt: new Date(0) }
        });
      }

      let lastProcessedTime = pullState.lastSyncedAt;

      await db.syncState.update({ where: { id: "pull_state" }, data: { status: "SYNCING" } });

      // 2. Fetch deletions from audit_logs
      try {
        const { data: deleteLogs, error: deleteError } = await supabase
          .from('audit_logs')
          .select('*')
          .eq('action', 'delete')
          .gt('created_at', pullState.lastSyncedAt.toISOString())
          .order('created_at', { ascending: true });

        if (deleteError) {
          console.warn(`[Sync Pull] Delete logs fetch failed: ${deleteError.message}`);
          errorsList.push({ table: "audit_logs", error: deleteError.message });
        } else if (deleteLogs && deleteLogs.length > 0) {
          for (const log of deleteLogs) {
            try {
              const camelLog = toCamelCase(log);
              const modelName = resolveSyncModel(camelLog.entityName);
              const logDate = new Date(camelLog.createdAt);
              if (modelName) {
                if (!isLegacyPullRowCopyEnabled(modelName)) {
                  // Cut-over model: direct row delete copy is hard-disabled
                  if (logDate > lastProcessedTime) lastProcessedTime = logDate;
                  continue;
                }
                const config = SYNC_MODEL_CONFIG[modelName];
                const delegate = (db as any)[config.delegate];
                try {
                  await delegate.delete({ where: { id: camelLog.entityId } });
                  pulledCount++;
                } catch (error: any) {
                  if (error?.code !== "P2025") {
                    console.warn(`[Sync Pull] Delete local entity failed for ${config?.table || modelName}:${camelLog.entityId}: ${error?.message}`);
                    errorsList.push({ table: config?.table || modelName, rowId: camelLog.entityId, error: error?.message || String(error) });
                    skippedCount++;
                  }
                }
              }
              if (logDate > lastProcessedTime) lastProcessedTime = logDate;
            } catch (rowDelErr: any) {
              console.warn(`[Sync Pull] Exception processing delete log:`, rowDelErr);
              skippedCount++;
            }
          }
        }
      } catch (delFetchErr: any) {
        console.error(`[Sync Pull] Deletion handling exception:`, delFetchErr);
        errorsList.push({ table: "audit_logs", error: delFetchErr?.message || String(delFetchErr) });
      }

      // 3. Fetch creations/updates from actual tables (Table-Level Isolation)
      for (const modelName of PULL_ORDER) {
        if (!isLegacyPullRowCopyEnabled(modelName)) {
          // Cut-over model: legacy direct pull row-copy is hard-disabled.
          continue;
        }
        const config = SYNC_MODEL_CONFIG[modelName];
        if (!config) continue;

        try {
          const { data: rows, error: rowsError } = await supabase
            .from(config.table)
            .select('*')
            .gt(config.timeColumn, pullState.lastSyncedAt.toISOString())
            .order(config.timeColumn, { ascending: true });

          if (rowsError) {
            console.warn(`[Sync Pull] Fetch failed for ${config.table}: ${rowsError.message}. Skipping table.`);
            errorsList.push({ table: config.table, error: `Fetch failed: ${rowsError.message}` });
            skippedCount++;
            continue;
          }

          if (rows && rows.length > 0) {
            console.log(`[Sync Pull] Fetched ${rows.length} rows for ${config.table}`);
            for (const row of rows) {
              try {
                const camelRow = toCamelCase(row);
                const delegate = (db as any)[config.delegate];
                let upserted = false;
                try {
                  await delegate.upsert({
                    where: { id: camelRow.id },
                    update: camelRow,
                    create: camelRow
                  });
                  upserted = true;
                  pulledCount++;
                } catch (error: any) {
                  const errMsg = error?.message || '';
                  if (error?.code === 'P2002' || errMsg.includes('Unique constraint')) {
                    console.warn(`[Sync Pull] Unique constraint violation on ${config.table}:${camelRow.id}. Resolving...`);

                    if (config.table === 'materials' && camelRow.materialName) {
                      try {
                        const existing = await delegate.findUnique({ where: { materialName: camelRow.materialName } });
                        if (existing && existing.id !== camelRow.id) {
                          await delegate.update({
                            where: { id: existing.id },
                            data: { ratePerCft: camelRow.ratePerCft, updatedAt: camelRow.updatedAt }
                          });
                          console.log(`[Sync Pull] Material "${camelRow.materialName}" merged into existing local record ${existing.id}`);
                          pulledCount++;
                          const rowDate = getRowTimestamp(camelRow, config.timeField);
                          if (rowDate > lastProcessedTime) lastProcessedTime = rowDate;
                          continue;
                        }
                      } catch (matErr: any) {
                        console.warn(`[Sync Pull] Material merge fallback failed: ${matErr?.message}`);
                      }
                    }

                    if ((config.table === 'outgoing_sales' && camelRow.serialNumber != null) || (config.table === 'incoming_boulder' && camelRow.bookNumber != null)) {
                      try {
                        const searchField = config.table === 'outgoing_sales' ? { serialNumber: camelRow.serialNumber } : { bookNumber: camelRow.bookNumber };
                        const existing = await delegate.findFirst({ where: searchField });
                        if (existing) {
                          const incomingTime = new Date(camelRow.updatedAt).getTime();
                          const localTime = new Date(existing.updatedAt).getTime();
                          if (incomingTime >= localTime) {
                            await delegate.update({ where: { id: existing.id }, data: { ...camelRow, id: existing.id } });
                            console.warn(`[Sync Pull] Duplicate record in ${config.table} — remote is newer, updated local record.`);
                          } else {
                            console.warn(`[Sync Pull] Duplicate record in ${config.table} — local is newer, skipping remote.`);
                          }
                          pulledCount++;
                          const rowDate = getRowTimestamp(camelRow, config.timeField);
                          if (rowDate > lastProcessedTime) lastProcessedTime = rowDate;
                          continue;
                        }
                      } catch (dupErr: any) {
                        console.warn(`[Sync Pull] Duplicate resolution failed for ${config.table}: ${dupErr?.message}`);
                      }
                    }

                    if (config.table === 'parties' && camelRow.partyName) {
                      camelRow.partyName = `${camelRow.partyName} (Merge ${camelRow.id.slice(-4)})`;
                    } else if (config.table === 'vehicles' && camelRow.vehicleNumber) {
                      camelRow.vehicleNumber = `${camelRow.vehicleNumber} (Merge ${camelRow.id.slice(-4)})`;
                    } else if (config.table === 'suppliers' && camelRow.supplierName) {
                      camelRow.supplierName = `${camelRow.supplierName} (Merge ${camelRow.id.slice(-4)})`;
                    } else if (config.table === 'employees' && camelRow.name) {
                      camelRow.name = `${camelRow.name} (Merge ${camelRow.id.slice(-4)})`;
                    } else if (config.table === 'weighbridge_tickets' && camelRow.ticketNumber !== undefined && camelRow.ticketNumber !== null) {
                      const currentNum = typeof camelRow.ticketNumber === 'number' ? camelRow.ticketNumber : (parseInt(String(camelRow.ticketNumber), 10) || 0);
                      camelRow.ticketNumber = currentNum + 900000;
                    }

                    try {
                      await delegate.upsert({
                        where: { id: camelRow.id },
                        update: camelRow,
                        create: camelRow
                      });
                      pulledCount++;
                      const rowDate = getRowTimestamp(camelRow, config.timeField);
                      if (rowDate > lastProcessedTime) lastProcessedTime = rowDate;
                      continue;
                    } catch (retryError: any) {
                      const retryMsg = retryError?.message || String(retryError);
                      console.error(`[Sync Pull] Local upsert retry failed for ${config.table}:${camelRow.id}: ${retryMsg}`);
                      errorsList.push({ table: config.table, rowId: camelRow.id, error: retryMsg });
                      skippedCount++;
                      const rowDate = getRowTimestamp(camelRow, config.timeField);
                      if (rowDate > lastProcessedTime) lastProcessedTime = rowDate;
                      continue;
                    }
                  }
                  
                  console.error(`[Sync Pull] Local upsert failed for ${config.table}:${camelRow.id}: ${errMsg}`);
                  errorsList.push({ table: config.table, rowId: camelRow.id, error: errMsg });
                  skippedCount++;
                  const rowDate = getRowTimestamp(camelRow, config.timeField);
                  if (rowDate > lastProcessedTime) lastProcessedTime = rowDate;
                  continue;
                }

                if (upserted) {
                  const rowDate = getRowTimestamp(camelRow, config.timeField);
                  if (rowDate > lastProcessedTime) lastProcessedTime = rowDate;
                }
              } catch (rowErr: any) {
                const rowErrMsg = rowErr?.message || String(rowErr);
                console.error(`[Sync Pull] Row processing error for ${config.table}:`, rowErrMsg);
                errorsList.push({ table: config.table, rowId: (row as any)?.id, error: rowErrMsg });
                skippedCount++;
                const rowDate = getRowTimestamp(row, config.timeField);
                if (rowDate > lastProcessedTime) lastProcessedTime = rowDate;
              }
            }
          }
        } catch (tableErr: any) {
          const tableErrMsg = tableErr?.message || String(tableErr);
          console.error(`[Sync Pull] Table processing exception for ${config.table}:`, tableErrMsg);
          errorsList.push({ table: config.table, error: tableErrMsg });
          skippedCount++;
        }
      }

      const finalStatus: "IDLE" | "ERROR" | "PARTIAL_SUCCESS" =
        errorsList.length === 0 ? "IDLE" : (pulledCount > 0 ? "PARTIAL_SUCCESS" : "ERROR");
      const lastErrorMessage = errorsList.length > 0 ? errorsList.map(e => `${e.table}${e.rowId ? `:${e.rowId}` : ''}: ${e.error}`).join("; ") : null;

      const SAFETY_WINDOW_MS = 0;
      let finalPullCursor = pullState.lastSyncedAt;

      if (lastProcessedTime > pullState.lastSyncedAt) {
        finalPullCursor = new Date(Math.max(pullState.lastSyncedAt.getTime(), lastProcessedTime.getTime() - SAFETY_WINDOW_MS));
      }

      await db.syncState.update({
        where: { id: "pull_state" },
        data: {
          lastSyncedAt: finalPullCursor,
          status: finalStatus === "IDLE" ? "IDLE" : finalStatus,
          lastError: lastErrorMessage,
        }
      });

      return {
        pushed: pushedCount,
        pulled: pulledCount,
        skipped: skippedCount,
        errors: errorsList,
        status: finalStatus,
      };
    } catch (e: any) {
      const topErrorMsg = e?.message || String(e);
      console.error(`[Sync Pull] Top-level error:`, topErrorMsg);
      errorsList.push({ table: "global", error: topErrorMsg });

      try {
        await db.syncState.update({
          where: { id: "pull_state" },
          data: { status: "ERROR", lastError: topErrorMsg }
        });
      } catch (dbErr) {
        console.error("[Sync Pull] Failed to update pull syncState on error:", dbErr);
      }

      return {
        pushed: pushedCount,
        pulled: pulledCount,
        skipped: skippedCount,
        errors: errorsList,
        status: "ERROR",
      };
    }
  });
}

export async function getSyncStatus() {
  const db = await getDb();
  const pushState = await db.syncState.findUnique({ where: { id: "default" } });
  const pullState = await db.syncState.findUnique({ where: { id: "pull_state" } });
  
  const pushCursor = pushState?.lastSyncedAt || new Date(0);
  const [auditCount, outboxPending, ...projectionCounts] = await Promise.all([
    db.auditLog.count({ where: { createdAt: { gt: pushCursor } } }),
    db.syncOutboxEvent.count({ where: { status: { in: ["PENDING", "SENDING"] } } }),
    ...DIRECT_PUSH_MODELS.map((modelName) => {
      const config = SYNC_MODEL_CONFIG[modelName];
      return (db as any)[config.delegate].count({
        where: { [config.timeField]: { gt: pushCursor } },
      }) as Promise<number>;
    }),
  ]);
  const pendingCount = auditCount + outboxPending + projectionCounts.reduce((total, count) => total + count, 0);

  return {
    lastSyncedAt: pushState?.lastSyncedAt || null,
    lastPulledAt: pullState?.lastSyncedAt || null,
    status: pushState?.status === "ERROR" || pullState?.status === "ERROR" ? "ERROR" :
            pushState?.status === "PARTIAL_SUCCESS" || pullState?.status === "PARTIAL_SUCCESS" ? "PARTIAL_SUCCESS" :
            pushState?.status === "SYNCING" || pullState?.status === "SYNCING" ? "SYNCING" : "IDLE",
    lastError: pushState?.lastError || pullState?.lastError || null,
    pendingCount
  };
}

// ---------- Data Retention ----------

const RETENTION_POLICY: { table: string; days: number }[] = [
  { table: "audit_logs",              days: 3  },
  { table: "financial_events",        days: 30 },
  { table: "ledger_entries",          days: 30 },
  { table: "inventory_transactions",  days: 30 },
];

export async function purgeOldSupabaseData(): Promise<{ purged: Record<string, number> }> {
  const supabase = createSyncClient();
  const purged: Record<string, number> = {};

  for (const { table, days } of RETENTION_POLICY) {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const { count, error } = await supabase
        .from(table as any)
        .delete({ count: "exact" })
        .lt("created_at", cutoff.toISOString());

      if (error) {
        console.warn(`[Retention] Failed to purge ${table}: ${error.message}`);
        purged[table] = 0;
      } else {
        purged[table] = count ?? 0;
        if (count && count > 0) {
          console.log(`[Retention] Purged ${count} old rows from ${table}`);
        }
      }
    } catch (e: any) {
      console.warn(`[Retention] Error purging ${table}: ${e?.message}`);
      purged[table] = 0;
    }
  }

  return { purged };
}

// ---------- Force Push All Tables (RETIRED) ----------

export async function forcePushAllTables(): Promise<{
  success: boolean;
  code: "RETIRED_OPERATION";
  error: string;
  safeReplacement: string;
  pushed: number;
  skipped: number;
  errors: SyncErrorItem[];
  status: "ERROR";
  tableBreakdown: Array<{ table: string; pushed: number; errors: number }>;
}> {
  console.warn("[Sync] forcePushAllTables called but has been retired. Failing closed.");
  return {
    success: false,
    code: "RETIRED_OPERATION",
    error: "forcePushAllTables has been retired. Unsafe table-wide force-push overwrites event tracking. Use 'Retry Outbox' or staged restore instead.",
    safeReplacement: "retryOutboxDelivery",
    pushed: 0,
    skipped: 0,
    errors: [{ table: "global", error: "forcePushAllTables has been retired" }],
    status: "ERROR",
    tableBreakdown: [],
  };
}

// ---------- Storage Stats ----------

export interface SupabaseStorageStats {
  tables: { table: string; totalSize: string; rowCount: number }[];
  totalDiskMB: number;
  limitMB: number;
  usagePercent: number;
}

export async function getSupabaseStorageStats(): Promise<SupabaseStorageStats> {
  const supabase = createSyncClient();
  const FREE_TIER_LIMIT_MB = 500;

  const { data: rpcData, error: rpcError } = await supabase.rpc("get_table_sizes");

  if (!rpcError && rpcData && Array.isArray(rpcData)) {
    const tables = rpcData.map((row: any) => ({
      table: row.table_name,
      totalSize: row.total_size,
      rowCount: Number(row.row_count) || 0,
    }));
    const totalDiskMB = rpcData.reduce(
      (sum: number, row: any) => sum + (Number(row.total_bytes) || 0),
      0
    ) / (1024 * 1024);

    return {
      tables,
      totalDiskMB: Math.round(totalDiskMB * 100) / 100,
      limitMB: FREE_TIER_LIMIT_MB,
      usagePercent: Math.round((totalDiskMB / FREE_TIER_LIMIT_MB) * 10000) / 100,
    };
  }

  const allTables: string[] = Object.values(SYNC_MODEL_CONFIG).map((c) => c.table);
  allTables.push("audit_logs");

  const ROW_SIZE_ESTIMATES: Record<string, number> = {
    audit_logs: 400, financial_events: 400, ledger_entries: 300,
    outgoing_sales: 500, incoming_boulder: 450, party_ledger: 250,
    inventory_transactions: 200, expenses: 350, party_credit: 200,
    party_collections: 250, party_payments: 250, day_book_entries: 250,
    day_book_expense_entries: 200, employee_ledgers: 200, fuel_purchases: 300,
    cash_transfers: 200, day_books: 300, weighbridge_tickets: 350,
  };
  const DEFAULT_ROW_SIZE = 250;

  const tableStats: { table: string; totalSize: string; rowCount: number }[] = [];
  let totalBytes = 0;

  for (const table of allTables) {
    try {
      const { count, error } = await supabase
        .from(table as any)
        .select("*", { count: "exact", head: true });

      const rowCount = error ? 0 : (count ?? 0);
      const rowSize = ROW_SIZE_ESTIMATES[table] ?? DEFAULT_ROW_SIZE;
      const estimatedBytes = rowCount * rowSize;
      totalBytes += estimatedBytes;

      tableStats.push({
        table,
        totalSize: estimatedBytes > 1024 * 1024
          ? `${(estimatedBytes / (1024 * 1024)).toFixed(1)} MB`
          : `${(estimatedBytes / 1024).toFixed(1)} KB`,
        rowCount,
      });
    } catch {
      tableStats.push({ table, totalSize: "?", rowCount: 0 });
    }
  }

  tableStats.sort((a, b) => b.rowCount - a.rowCount);

  const totalDiskMB = totalBytes / (1024 * 1024);
  return {
    tables: tableStats,
    totalDiskMB: Math.round(totalDiskMB * 100) / 100,
    limitMB: FREE_TIER_LIMIT_MB,
    usagePercent: Math.round((totalDiskMB / FREE_TIER_LIMIT_MB) * 10000) / 100,
  };
}

export async function getDetailedSyncStatus() {
  const health = await getDetailedSyncHealth(undefined, _lastHeldLogs);
  return {
    ...health,
    models: health.models.map((m) => ({
      name: m.name,
      table: m.table,
      pendingCount: m.pendingLegacyCount + m.outboxPendingCount,
      deliveryMode: m.deliveryMode,
      lastError: null,
      status: m.status,
    })),
    recentErrors: health.recentErrors.map((e) => ({
      timestamp: e.timestamp,
      table: e.entityType,
      rowId: e.entityId,
      error: `[${e.code}] ${e.message}`,
      errorCode: e.code,
    })),
    heldLogs: _lastHeldLogs,
  };
}

const RESTORE_SKIP_TABLES = new Set(["audit_logs"]);

export async function checkRestoreEligibility(): Promise<{
  eligible: boolean;
  localRecordCount: number;
  supabaseTables: Array<{ table: string; rowCount: number }>;
  totalSupabaseRows: number;
  hasExistingData: boolean;
  warnings: string[];
}> {
  const db = await getDb();
  const supabase = createSyncClient();

  let localRecordCount = 0;
  const keyDelegates: (keyof typeof SYNC_MODEL_CONFIG)[] = [
    "Party", "Vehicle", "Material", "OutgoingSale", "IncomingBoulder",
    "Employee", "Supplier", "Expense", "GlobalSettings",
  ];
  for (const modelName of keyDelegates) {
    const config = SYNC_MODEL_CONFIG[modelName];
    try {
      const count = await (db as any)[config.delegate].count();
      localRecordCount += count;
    } catch {}
  }

  const supabaseTables: Array<{ table: string; rowCount: number }> = [];
  let totalSupabaseRows = 0;
  const warnings: string[] = [];

  for (const modelName of PULL_ORDER) {
    const config = SYNC_MODEL_CONFIG[modelName];
    if (RESTORE_SKIP_TABLES.has(config.table)) continue;

    try {
      const { count, error } = await supabase
        .from(config.table)
        .select("*", { count: "exact", head: true });

      if (error) {
        warnings.push(`Could not check ${config.table}: ${error.message}`);
        supabaseTables.push({ table: config.table, rowCount: 0 });
      } else {
        const rowCount = count ?? 0;
        supabaseTables.push({ table: config.table, rowCount });
        totalSupabaseRows += rowCount;
      }
    } catch (err: any) {
      warnings.push(`Error checking ${config.table}: ${err?.message || String(err)}`);
      supabaseTables.push({ table: config.table, rowCount: 0 });
    }
  }

  supabaseTables.sort((a, b) => b.rowCount - a.rowCount);
  const hasExistingData = localRecordCount > 5;

  if (totalSupabaseRows === 0) {
    warnings.push("No data found on the server. Nothing to restore.");
  }
  if (hasExistingData) {
    warnings.push(`Local database has ${localRecordCount} existing records. A full restore will overwrite all local data.`);
  }

  return {
    eligible: totalSupabaseRows > 0,
    localRecordCount,
    supabaseTables,
    totalSupabaseRows,
    hasExistingData,
    warnings,
  };
}

async function fetchAllRows(
  supabase: ReturnType<typeof createSyncClient>,
  table: string,
  timeColumn: string
): Promise<{ rows: any[]; error: string | null }> {
  const PAGE_SIZE = 1000;
  const allRows: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(timeColumn, { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      return { rows: allRows, error: `Fetch failed at offset ${offset}: ${error.message}` };
    }

    if (data && data.length > 0) {
      allRows.push(...data);
      offset += data.length;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return { rows: allRows, error: null };
}

/**
 * Full restore: delegates to safe staged restore.
 */
export async function fullRestoreFromSupabase(options?: StagedRestoreOptions): Promise<{
  success: boolean;
  tablesRestored: number;
  totalRows: number;
  errors: SyncErrorItem[];
  backupPath?: string;
}> {
  const db = await getDb();
  return stagedRestoreFromSupabase(db, options);
}
