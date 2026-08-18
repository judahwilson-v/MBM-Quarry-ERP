import { getDb } from "@/lib/prisma";
import { createSyncClient } from "@/lib/supabase/client-sync";
import { SYNC_MODEL_CONFIG, PULL_ORDER } from "./sync-config";

// We exclude tables that are not meant to be restored
const RESTORE_SKIP_TABLES = new Set(["sync_logs", "sync_states"]);

export interface DiffSummary {
  table: string;
  localOnly: number; // Records that exist only locally (will be lost)
  serverOnly: number; // Records that exist only on server (will be added)
  modified: number; // Records that exist on both but have different updatedAt
  identical: number; // Records that are exactly the same
}

/**
 * Calculates a lightweight summary of differences between the local database and the server.
 * Uses only `id` and `updatedAt` for fast comparison.
 */
export async function generateRestoreDiffSummary(): Promise<DiffSummary[]> {
  const db = await getDb();
  const supabase = createSyncClient();
  const summaries: DiffSummary[] = [];

  for (const modelName of PULL_ORDER) {
    const config = SYNC_MODEL_CONFIG[modelName];
    if (RESTORE_SKIP_TABLES.has(config.table)) continue;

    const summary: DiffSummary = {
      table: config.table,
      localOnly: 0,
      serverOnly: 0,
      modified: 0,
      identical: 0,
    };

    try {
      // 1. Fetch Local IDs and timestamps
      const delegate = (db as any)[config.delegate];
      if (!delegate) continue;

      const localRecords = await delegate.findMany({
        select: { id: true, updatedAt: true }
      });
      const localMap = new Map<string, Date>();
      for (const rec of localRecords) {
        localMap.set(rec.id, rec.updatedAt);
      }

      // 2. Fetch Server IDs and timestamps
      // We only select id and updated_at to minimize bandwidth
      const { data: serverRecords, error } = await supabase
        .from(config.table)
        .select("id, updated_at");

      if (error) {
        console.error(`Diff error for ${config.table}:`, error.message);
        continue;
      }

      const serverMap = new Map<string, Date>();
      for (const rec of serverRecords || []) {
        serverMap.set(rec.id, new Date(rec.updated_at));
      }

      // 3. Compare Local vs Server
      for (const [id, localTime] of localMap.entries()) {
        const serverTime = serverMap.get(id);
        if (!serverTime) {
          // Exists locally, but not on server
          summary.localOnly++;
        } else {
          // Exists on both
          // We allow 1000ms variance because Supabase Postgres timestamps might lose millisecond precision
          if (Math.abs(localTime.getTime() - serverTime.getTime()) > 1000) {
            summary.modified++;
          } else {
            summary.identical++;
          }
          // Remove from serverMap so we can count remaining as serverOnly
          serverMap.delete(id);
        }
      }

      // 4. Any remaining in serverMap are Server Only
      summary.serverOnly += serverMap.size;

      summaries.push(summary);
    } catch (error) {
      console.error(`Diff summary error for model ${modelName}:`, error);
    }
  }

  return summaries;
}

export interface DetailedDiff {
  id: string;
  status: 'localOnly' | 'serverOnly' | 'modified' | 'identical';
  localData: any | null;
  serverData: any | null;
}

/**
 * Fetches the full detailed diff for a single table.
 */
export async function getDetailedTableDiff(tableName: string): Promise<DetailedDiff[]> {
  const db = await getDb();
  const supabase = createSyncClient();

  // Find the model config for this table name
  let config: any = null;
  for (const modelName of Object.keys(SYNC_MODEL_CONFIG)) {
    if (SYNC_MODEL_CONFIG[modelName].table === tableName) {
      config = SYNC_MODEL_CONFIG[modelName];
      break;
    }
  }

  if (!config) {
    throw new Error(`Unknown table: ${tableName}`);
  }

  const delegate = (db as any)[config.delegate];
  if (!delegate) throw new Error(`Delegate not found for table: ${tableName}`);

  // Fetch full local records
  const localRecords = await delegate.findMany({});
  const localMap = new Map<string, any>();
  for (const rec of localRecords) {
    localMap.set(rec.id, rec);
  }

  // Fetch full server records
  const { data: serverRecords, error } = await supabase.from(tableName).select("*");
  if (error) {
    throw new Error(`Failed to fetch server data for ${tableName}: ${error.message}`);
  }

  const serverMap = new Map<string, any>();
  for (const rec of serverRecords || []) {
    serverMap.set(rec.id, rec);
  }

  const diffs: DetailedDiff[] = [];

  // Compare
  for (const [id, localData] of localMap.entries()) {
    const serverData = serverMap.get(id);
    if (!serverData) {
      diffs.push({ id, status: 'localOnly', localData, serverData: null });
    } else {
      const localTime = new Date(localData.updatedAt).getTime();
      const serverTime = new Date(serverData.updated_at || serverData.updatedAt).getTime(); // handle both cases just in case
      
      if (Math.abs(localTime - serverTime) > 1000) {
        diffs.push({ id, status: 'modified', localData, serverData });
      } else {
        diffs.push({ id, status: 'identical', localData, serverData });
      }
      serverMap.delete(id);
    }
  }

  for (const [id, serverData] of serverMap.entries()) {
    diffs.push({ id, status: 'serverOnly', localData: null, serverData });
  }

  return diffs;
}
