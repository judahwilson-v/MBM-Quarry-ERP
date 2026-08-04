import { getDb } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  DIRECT_PUSH_MODELS,
  extractEntityData,
  getRowTimestamp,
  LOCAL_CONFLICT_FIELDS,
  PULL_ORDER,
  REMOTE_CONFLICT_COLUMNS,
  resolveSyncModel,
  SYNC_MODEL_CONFIG,
} from "./sync-config";



// Convert camelCase object keys to snake_case for Supabase REST API
function toSnakeCase(obj: any): any {
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => toSnakeCase(v));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      result[snakeKey] = toSnakeCase(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
}

// Convert snake_case to camelCase for Prisma
function toCamelCase(obj: any): any {
  if (obj instanceof Date) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => toCamelCase(v));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      result[camelKey] = toCamelCase(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
}

export async function pushSync() {
  const db = await getDb();
  const supabase = createClient();
  
  // 1. Get sync state
  let syncState = await db.syncState.findUnique({ where: { id: "default" } });
  if (!syncState) {
    syncState = await db.syncState.create({
      data: { id: "default", lastSyncedAt: new Date(0) }
    });
  }

  // 2. Fetch new audit logs since last sync
  const unsyncedLogs = await db.auditLog.findMany({
    where: { createdAt: { gt: syncState.lastSyncedAt } },
    orderBy: { createdAt: 'asc' }
  });

  let lastProcessedTime = syncState.lastSyncedAt;
  let successCount = 0;

  await db.syncState.update({ where: { id: "default" }, data: { status: "SYNCING" } });

  try {


    for (const log of unsyncedLogs) {
      const modelName = resolveSyncModel(log.entityName);
      const config = modelName ? SYNC_MODEL_CONFIG[modelName] : null;
      
      if (config) {
        if (log.action === "delete") {
          console.log(`[Sync Push] Deleting ${config.table}:${log.entityId}`);
          const { error } = await supabase.from(config.table).delete().eq("id", log.entityId);
          if (error) throw new Error(`[Sync Push] Delete failed for ${config.table}:${log.entityId}: ${error.message}`);
        } else if ((log.action === "create" || log.action === "update") && log.payload) {
          const entityData = extractEntityData(JSON.parse(log.payload));
          const snakeData = toSnakeCase(entityData);
          console.log(`[Sync Push] Upserting ${config.table}:${String(snakeData.id ?? log.entityId)}`);
          const { error } = await supabase.from(config.table).upsert(snakeData);
          if (error) {
            throw new Error(`[Sync Push] Upsert failed for ${config.table}:${log.entityId}: ${error.message}`);
          }
        }
      }
      
      // Push the audit log itself to Supabase so other PCs know about deletions
      const { error: auditError } = await supabase.from("audit_logs").upsert(toSnakeCase(log));
      if (auditError) throw auditError;

      lastProcessedTime = log.createdAt;
      successCount++;
    }

    // Event, ledger, and inventory projections are not represented by their
    // own audit rows. Scan their timestamps so they are not silently omitted.
    for (const modelName of DIRECT_PUSH_MODELS) {
      const config = SYNC_MODEL_CONFIG[modelName];
      const delegate = (db as any)[config.delegate];
      const rows = await delegate.findMany({
        where: { [config.timeField]: { gt: syncState.lastSyncedAt } },
        orderBy: { [config.timeField]: "asc" },
      });

      for (const row of rows as Record<string, unknown>[]) {
        const snakeData = toSnakeCase(row);
        console.log(`[Sync Push] Upserting projection ${config.table}:${String(snakeData.id)}`);
        const conflictColumn = REMOTE_CONFLICT_COLUMNS[modelName];
        const { error } = await supabase
          .from(config.table)
          .upsert(snakeData, conflictColumn ? { onConflict: conflictColumn } : undefined);
        if (error) {
          throw new Error(`[Sync Push] Projection upsert failed for ${config.table}:${String(snakeData.id)}: ${error.message}`);
        }
        const rowDate = getRowTimestamp(row, config.timeField);
        if (rowDate > lastProcessedTime) lastProcessedTime = rowDate;
        successCount++;
      }
    }

    await db.syncState.update({
      where: { id: "default" },
      data: { lastSyncedAt: lastProcessedTime, status: "IDLE", lastError: null }
    });

  } catch (e: any) {
    console.error(`Sync error on log:`, e);
    await db.syncState.update({
      where: { id: "default" },
      data: { status: "ERROR", lastError: e.message || "Unknown sync error" }
    });
    // Stop syncing on first error to maintain ordering and let the UI report it.
    throw e;
  }

  return { pushed: successCount };
}

export async function pullSync() {
  const db = await getDb();
  const supabase = createClient();
  
  // 1. Get pull state
  let pullState = await db.syncState.findUnique({ where: { id: "pull_state" } });
  if (!pullState) {
    pullState = await db.syncState.create({
      data: { id: "pull_state", lastSyncedAt: new Date(0) }
    });
  }

  let lastProcessedTime = pullState.lastSyncedAt;
  let successCount = 0;

  await db.syncState.update({ where: { id: "pull_state" }, data: { status: "SYNCING" } });

  try {


    // 2. Fetch deletions from audit_logs
    const { data: deleteLogs, error: deleteError } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('action', 'delete')
      .gt('created_at', pullState.lastSyncedAt.toISOString())
      .order('created_at', { ascending: true });

    if (deleteError) throw deleteError;

    if (deleteLogs && deleteLogs.length > 0) {
      for (const log of deleteLogs) {
        const camelLog = toCamelCase(log);
        const modelName = resolveSyncModel(camelLog.entityName);
        if (modelName) {
           const config = SYNC_MODEL_CONFIG[modelName];
           const delegate = (db as any)[config.delegate];
           try {
             await delegate.delete({ where: { id: camelLog.entityId } });
             successCount++;
           } catch (error: any) {
             // P2025 means the row was already absent locally; other failures
             // must stop the cursor from moving past an unapplied deletion.
             if (error?.code !== "P2025") throw error;
           }
        }
        const logDate = new Date(camelLog.createdAt);
        if (logDate > lastProcessedTime) lastProcessedTime = logDate;
      }
    }

    // 3. Fetch creations/updates from actual tables
    for (const modelName of PULL_ORDER) {
      const config = SYNC_MODEL_CONFIG[modelName];

      const { data: rows, error: rowsError } = await supabase
        .from(config.table)
        .select('*')
        .gt(config.timeColumn, pullState.lastSyncedAt.toISOString())
        .order(config.timeColumn, { ascending: true });

      if (rowsError) throw new Error(`[Sync Pull] Fetch failed for ${config.table}: ${rowsError.message}`);

      if (rows && rows.length > 0) {
        console.log(`[Sync Pull] Fetched ${rows.length} rows for ${config.table}`);
        for (const row of rows) {
           const camelRow = toCamelCase(row);
           const delegate = (db as any)[config.delegate];
           const conflictField = LOCAL_CONFLICT_FIELDS[modelName] ?? "id";
           try {
             await delegate.upsert({
               where: { [conflictField]: camelRow[conflictField] },
               update: camelRow,
               create: camelRow
             });
             successCount++;
           } catch(error: any) {
             throw new Error(`[Sync Pull] Local upsert failed for ${config.table}:${camelRow.id}: ${error?.message ?? error}`);
           }
           
           const rowDate = getRowTimestamp(camelRow, config.timeField);
           if (rowDate > lastProcessedTime) lastProcessedTime = rowDate;
        }
      }
    }

    await db.syncState.update({
      where: { id: "pull_state" },
      data: { lastSyncedAt: lastProcessedTime, status: "IDLE", lastError: null }
    });

  } catch (e: any) {
    console.error(`Pull sync error:`, e);
    await db.syncState.update({
      where: { id: "pull_state" },
      data: { status: "ERROR", lastError: e.message || "Unknown pull error" }
    });
    throw e;
  }

  return { pulled: successCount };
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
            pushState?.status === "SYNCING" || pullState?.status === "SYNCING" ? "SYNCING" : "IDLE",
    lastError: pushState?.lastError || pullState?.lastError || null,
    pendingCount
  };
}
