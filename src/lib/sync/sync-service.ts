import { getDb } from "@/lib/prisma";
import { createSyncClient } from "@/lib/supabase/client-sync";
import {
  DIRECT_PUSH_MODELS,
  extractEntityData,
  getRowTimestamp,
  PULL_ORDER,
  PUSH_PRIORITY,
  resolveSyncModel,
  SYNC_MODEL_CONFIG,
} from "./sync-config";

import SYNC_MAP from "./sync-map.json";

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
      // IMPORTANT: Do NOT call recordSkippedTime for permanently held FK logs.
      // Previously this blocked the cursor forever, creating a deadlock where
      // no subsequent logs could ever sync. Instead, advance past them and
      // let the next sync cycle retry. The parent data will eventually arrive
      // via pullSync or a future pushSync.
      for (const heldLog of currentHeld) {
        if (heldLog.createdAt > lastProcessedTime) {
          lastProcessedTime = heldLog.createdAt;
        }
      }
      console.warn(`[Sync Push] ${currentHeld.length} logs remain held due to missing parent foreign keys. Cursor will advance past them to prevent deadlock.`);

      // Store held logs for diagnostics (accessible via getDetailedSyncStatus)
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

    // Cursor Management
    // SAFETY_WINDOW_MS was disabled (0) because it caused infinite loops where the same
    // records within the last 10 seconds were repeatedly fetched and pushed,
    // spamming the Supabase API and causing 'changes pending' to never reach 0.
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
}

export async function pullSync(): Promise<SyncResult> {
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
            if (modelName) {
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
            const logDate = new Date(camelLog.createdAt);
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
          continue; // Continue loop for remaining tables in PULL_ORDER!
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

                  // Materials: same name = same entity
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

                  // Sales & Boulders: duplicate serial/book number
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

                  // Name-based entities: append merge suffix
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
                
                // Non-unique constraint upsert error
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
        // Continue loop for remaining tables!
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
}

export async function getSyncStatus() {
  const db = await getDb();
  const pushState = await db.syncState.findUnique({ where: { id: "default" } });
  const pullState = await db.syncState.findUnique({ where: { id: "pull_state" } });
  
  const pushCursor = pushState?.lastSyncedAt || new Date(0);
  const [auditCount, ...projectionCounts] = await Promise.all([
    db.auditLog.count({ where: { createdAt: { gt: pushCursor } } }),
    ...DIRECT_PUSH_MODELS.map((modelName) => {
      const config = SYNC_MODEL_CONFIG[modelName];
      return (db as any)[config.delegate].count({
        where: { [config.timeField]: { gt: pushCursor } },
      }) as Promise<number>;
    }),
  ]);
  const pendingCount = auditCount + projectionCounts.reduce((total, count) => total + count, 0);

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

/** Per-table retention policies (days). Audit logs are ephemeral (3 days),
 *  other event/log tables keep 30 days. Local SQLite is never touched. */
const RETENTION_POLICY: { table: string; days: number }[] = [
  { table: "audit_logs",              days: 3  },
  { table: "financial_events",        days: 30 },
  { table: "ledger_entries",          days: 30 },
  { table: "inventory_transactions",  days: 30 },
];

/**
 * Deletes rows older than their retention period from Supabase.
 * Only affects Supabase — local SQLite keeps full history forever.
 * Safe to run repeatedly; idempotent.
 */
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

// ---------- Storage Stats ----------

export interface SupabaseStorageStats {
  tables: { table: string; totalSize: string; rowCount: number }[];
  totalDiskMB: number;
  limitMB: number;
  usagePercent: number;
}

/**
 * Queries Supabase for per-table storage usage via pg_total_relation_size.
 * Uses a Supabase RPC call. If the RPC function doesn't exist, falls back
 * to a row-count-based estimate.
 */
export async function getSupabaseStorageStats(): Promise<SupabaseStorageStats> {
  const supabase = createSyncClient();
  const FREE_TIER_LIMIT_MB = 500;

  // Try the RPC approach first (requires the function to be created in Supabase)
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

  // Fallback: estimate from row counts
  const allTables: string[] = Object.values(SYNC_MODEL_CONFIG).map((c) => c.table);
  allTables.push("audit_logs"); // audit_logs is always synced

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

  // Sort by estimated size descending
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
  const db = await getDb();
  let syncState = await db.syncState.findUnique({ where: { id: "default" } });
  if (!syncState) {
    syncState = await db.syncState.create({
      data: { id: "default", lastSyncedAt: new Date(0) }
    });
  }
  const pullState = await db.syncState.findUnique({ where: { id: "pull_state" } });

  const pushCursor = syncState.lastSyncedAt || new Date(0);

  const models: Array<{
    name: string;
    table: string;
    pendingCount: number;
    lastError: string | null;
    status: 'synced' | 'pending' | 'error';
  }> = [];
  let totalPending = 0;

  const sortedModels = Object.entries(PUSH_PRIORITY)
    .sort(([, a], [, b]) => a - b)
    .map(([name]) => name) as Array<keyof typeof SYNC_MODEL_CONFIG>;

  for (const modelName of sortedModels) {
    const config = SYNC_MODEL_CONFIG[modelName];
    if (!config) continue;

    let pendingCount = await db.auditLog.count({
      where: {
        entityName: modelName,
        createdAt: { gt: pushCursor }
      }
    });

    if (DIRECT_PUSH_MODELS.includes(modelName as any)) {
      try {
        const delegate = (db as any)[config.delegate];
        if (delegate) {
          const projectionCount = await delegate.count({
            where: { [config.timeField]: { gt: pushCursor } }
          });
          pendingCount += projectionCount;
        }
      } catch {
        // projection table might not exist yet
      }
    }

    models.push({
      name: modelName,
      table: config.table,
      pendingCount,
      lastError: null,
      status: pendingCount > 0 ? 'pending' : 'synced'
    });

    totalPending += pendingCount;
  }

  const recentErrors: Array<{
    timestamp: string;
    table: string;
    rowId: string | null;
    error: string;
    errorCode: string | null;
  }> = [];

  if (syncState.lastError) {
    const errorStrings = syncState.lastError.split('; ');
    for (const errStr of errorStrings) {
      const trimmed = errStr.trim();
      if (!trimmed) continue;
      const colonMatch = trimmed.match(/^([^:]+):([^:]+): (.+)$/);
      if (colonMatch) {
        recentErrors.push({
          timestamp: new Date().toISOString(),
          table: colonMatch[1],
          rowId: colonMatch[2],
          error: colonMatch[3],
          errorCode: null
        });
      } else {
        recentErrors.push({
          timestamp: new Date().toISOString(),
          table: 'unknown',
          rowId: null,
          error: trimmed,
          errorCode: null
        });
      }
    }
  }

  const status = syncState.status === 'SYNCING' ? 'SYNCING' as const
    : syncState.lastError ? 'ERROR' as const
    : totalPending > 0 ? 'PARTIAL_SUCCESS' as const
    : 'IDLE' as const;

  return {
    overall: {
      status,
      lastPushedAt: syncState.lastSyncedAt?.toISOString() || null,
      lastPulledAt: pullState?.lastSyncedAt?.toISOString() || null,
      totalPending,
      lastError: syncState.lastError
    },
    models,
    recentErrors,
    heldLogs: _lastHeldLogs
  };
}

// ---------- Full Restore from Supabase ----------

/**
 * Order for DELETING local data: reverse of PULL_ORDER (children first, parents last).
 * This avoids FK constraint violations during cleanup.
 */
const DELETE_ORDER: (keyof typeof SYNC_MODEL_CONFIG)[] = [...PULL_ORDER].reverse();

/**
 * Tables to skip during full restore because they are ephemeral / retention-purged
 * on Supabase and not essential for a working system.
 */
const RESTORE_SKIP_TABLES = new Set(["audit_logs"]);

/**
 * Check if the local database is effectively empty (fresh install)
 * and if Supabase has data available to restore.
 */
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

  // Count local records across key tables
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
    } catch {
      // Table might not exist yet
    }
  }

  // Count Supabase records per table
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

  // Sort tables by row count descending for the UI
  supabaseTables.sort((a, b) => b.rowCount - a.rowCount);

  const hasExistingData = localRecordCount > 5; // Bootstrap seed creates a few default records

  if (totalSupabaseRows === 0) {
    warnings.push("No data found on the server. Nothing to restore.");
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

/**
 * Fetches ALL rows from a Supabase table using range-based pagination.
 * Supabase REST API returns max 1000 rows per request.
 */
async function fetchAllRows(
  supabase: ReturnType<typeof createSyncClient>,
  table: string,
  timeColumn: string,
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
 * Full restore: wipes local database and pulls ALL data from Supabase.
 * Use this on a fresh PC install to clone the data from the server.
 *
 * @param options.force - If true, allows restore even when local DB has existing data.
 */
export async function fullRestoreFromSupabase(
  options?: { force?: boolean }
): Promise<{
  success: boolean;
  tablesRestored: number;
  totalRows: number;
  errors: SyncErrorItem[];
}> {
  const db = await getDb();
  const supabase = createSyncClient();
  const errors: SyncErrorItem[] = [];

  let tablesRestored = 0;
  let totalRows = 0;

  try {
    // Safety check: ensure local DB is empty unless forced
    if (!options?.force) {
      const eligibility = await checkRestoreEligibility();
      if (eligibility.hasExistingData) {
        return {
          success: false,
          tablesRestored: 0,
          totalRows: 0,
          errors: [{ table: "global", error: "Local database has existing data. Use force=true to overwrite." }],
        };
      }
    }

    // Mark sync state as restoring
    try {
      const existingSyncState = await db.syncState.findUnique({ where: { id: "default" } });
      if (existingSyncState) {
        await db.syncState.update({ where: { id: "default" }, data: { status: "SYNCING", lastError: null } });
      } else {
        await db.syncState.create({ data: { id: "default", lastSyncedAt: new Date(0), status: "SYNCING" } });
      }
    } catch {
      // SyncState table might not exist yet on a truly fresh DB, continue anyway
    }

    // Phase 1: Clear ALL local data (in reverse FK order)
    console.log("[Full Restore] Phase 1: Clearing local data...");
    for (const modelName of DELETE_ORDER) {
      const config = SYNC_MODEL_CONFIG[modelName];
      try {
        const delegate = (db as any)[config.delegate];
        if (delegate) {
          await delegate.deleteMany({});
          console.log(`[Full Restore] Cleared local ${config.table}`);
        }
      } catch (err: any) {
        console.warn(`[Full Restore] Could not clear ${config.table}: ${err?.message}`);
        // Continue even if clearing fails — the upsert will handle conflicts
      }
    }

    // Also clear audit_logs locally since we're starting fresh
    try {
      await db.auditLog.deleteMany({});
      console.log("[Full Restore] Cleared local audit_logs");
    } catch {
      // OK if it fails
    }

    // Phase 2: Fetch and insert from Supabase for each table in dependency order
    console.log("[Full Restore] Phase 2: Fetching and inserting data from Supabase...");
    for (const modelName of PULL_ORDER) {
      const config = SYNC_MODEL_CONFIG[modelName];
      if (RESTORE_SKIP_TABLES.has(config.table)) continue;

      try {
        const { rows, error: fetchError } = await fetchAllRows(supabase, config.table, config.timeColumn);

        if (fetchError) {
          console.warn(`[Full Restore] Fetch error for ${config.table}: ${fetchError}`);
          errors.push({ table: config.table, error: fetchError });
          continue;
        }

        if (rows.length === 0) {
          console.log(`[Full Restore] ${config.table}: 0 rows (skipping)`);
          continue;
        }

        console.log(`[Full Restore] ${config.table}: ${rows.length} rows fetched, inserting...`);

        const delegate = (db as any)[config.delegate];
        let tableInserted = 0;

        // Insert in batches of 100 to avoid SQLite limits
        const BATCH_SIZE = 100;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          const camelBatch = batch.map((row: any) => toCamelCase(row));

          for (const camelRow of camelBatch) {
            try {
              await delegate.upsert({
                where: { id: camelRow.id },
                update: camelRow,
                create: camelRow,
              });
              tableInserted++;
            } catch (insertErr: any) {
              const errMsg = insertErr?.message || String(insertErr);
              // Handle unique constraint by trying update-only
              if (insertErr?.code === 'P2002' || errMsg.includes('Unique constraint')) {
                try {
                  await delegate.update({
                    where: { id: camelRow.id },
                    data: camelRow,
                  });
                  tableInserted++;
                } catch (updateErr: any) {
                  console.warn(`[Full Restore] Row insert/update failed for ${config.table}:${camelRow.id}: ${updateErr?.message}`);
                  errors.push({ table: config.table, rowId: camelRow.id, error: updateErr?.message || String(updateErr) });
                }
              } else {
                console.warn(`[Full Restore] Row insert failed for ${config.table}:${camelRow.id}: ${errMsg}`);
                errors.push({ table: config.table, rowId: camelRow.id, error: errMsg });
              }
            }
          }
        }

        totalRows += tableInserted;
        if (tableInserted > 0) tablesRestored++;
        console.log(`[Full Restore] ${config.table}: ${tableInserted}/${rows.length} rows inserted`);
      } catch (tableErr: any) {
        console.error(`[Full Restore] Table ${config.table} failed:`, tableErr);
        errors.push({ table: config.table, error: tableErr?.message || String(tableErr) });
      }
    }

    // Phase 3: Reset sync cursors to now() so incremental sync works going forward
    console.log("[Full Restore] Phase 3: Resetting sync cursors...");
    const now = new Date();
    try {
      await db.syncState.upsert({
        where: { id: "default" },
        update: { lastSyncedAt: now, status: "IDLE", lastError: null },
        create: { id: "default", lastSyncedAt: now, status: "IDLE" },
      });
      await db.syncState.upsert({
        where: { id: "pull_state" },
        update: { lastSyncedAt: now, status: "IDLE", lastError: null },
        create: { id: "pull_state", lastSyncedAt: now, status: "IDLE" },
      });
    } catch (cursorErr: any) {
      console.warn(`[Full Restore] Could not reset sync cursors: ${cursorErr?.message}`);
      errors.push({ table: "sync_state", error: `Cursor reset failed: ${cursorErr?.message}` });
    }

    const success = errors.length === 0;
    console.log(`[Full Restore] Complete. ${tablesRestored} tables, ${totalRows} rows. ${errors.length} errors.`);

    return { success, tablesRestored, totalRows, errors };
  } catch (e: any) {
    console.error("[Full Restore] Fatal error:", e);

    try {
      await db.syncState.update({
        where: { id: "default" },
        data: { status: "ERROR", lastError: `Full restore failed: ${e?.message}` },
      });
    } catch {
      // If we can't even update sync state, nothing more to do
    }

    return {
      success: false,
      tablesRestored,
      totalRows,
      errors: [{ table: "global", error: e?.message || String(e) }],
    };
  }
}
