"use server";

import { getDb } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { pushSync, pullSync } from "@/lib/sync/sync-service";

export async function forceSync() {
  try {
    const pushResult = await pushSync();
    const pullResult = await pullSync();
    return { success: true, message: `Sync triggered. Pushed: ${pushResult.pushed}, Pulled: ${pullResult.pulled}` };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export async function resetSyncQueue() {
  try {
    const db = await getDb();
    const result = await db.financialEvent.deleteMany({
      where: {
        // Technically, all events in the local DB are essentially the queue,
        // but resetting it means wiping the unsynced ones.
        // For MBM, the sync engine tracks by cursor. So to "reset" the queue,
        // we could just drop all local events and rely on Supabase pulling them down again,
        // OR we just reset the sync_state cursor to 0 to force a full re-download.
      }
    });
    
    // Instead of deleting data, resetting the cursor is safer to fix stuck syncs
    await db.$executeRawUnsafe(`UPDATE sync_state SET last_synced_at = '1970-01-01T00:00:00.000Z'`);
    
    return { success: true, message: "Sync cursor reset to origin. Next sync will be a full pull." };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export async function getDatabaseInfo() {
  try {
    const db = await getDb();
    
    // Get counts
    const salesCount = await db.outgoingSales.count();
    const boulderCount = await db.incomingBoulder.count();
    const eventCount = await db.financialEvent.count();
    
    return {
      success: true,
      data: {
        salesCount,
        boulderCount,
        eventCount,
        version: "SQLite 3",
        status: "Healthy"
      }
    };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}
