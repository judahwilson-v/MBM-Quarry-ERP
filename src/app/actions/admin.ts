"use server";

import { getDb } from "@/lib/prisma";
import { pushSync, pullSync, purgeOldSupabaseData, getSupabaseStorageStats } from "@/lib/sync/sync-service";
import { sanitizeError } from "@/lib/utils/sanitize-error";
import { requireControlActor } from "@/lib/identity/control";

export async function forceSync(sessionToken?: string | null) {
  try {
    await requireControlActor(sessionToken);
    const pushResult = await pushSync();
    const pullResult = await pullSync();
    return { success: true, message: `Sync triggered. Pushed: ${pushResult.pushed}, Pulled: ${pullResult.pulled}` };
  } catch (error: any) {
    return { success: false, message: sanitizeError(error) };
  }
}

export async function resetSyncQueue() {
  return {
    success: false,
    code: "RETIRED_OPERATION" as const,
    error: "resetSyncQueue has been retired. Rewinding the sync cursor causes duplicate re-pushes and collision merge suffixes.",
    safeReplacement: "forceSync",
    message: "Operation retired. Use normal sync or staged restore.",
  };
}

export async function getDatabaseInfo(sessionToken?: string | null) {
  try {
    await requireControlActor(sessionToken);
    const db = await getDb();
    
    // Get counts
    const salesCount = await db.outgoingSale.count();
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
    return { success: false, message: sanitizeError(error) };
  }
}

export async function getSupabaseStorageUsage(sessionToken?: string | null) {
  try {
    await requireControlActor(sessionToken);
    const stats = await getSupabaseStorageStats();
    return { success: true, data: stats };
  } catch (error: any) {
    return { success: false, message: sanitizeError(error) };
  }
}

export async function triggerSupabaseDataPurge(sessionToken?: string | null) {
  try {
    await requireControlActor(sessionToken);
    const result = await purgeOldSupabaseData();
    return result;
  } catch (error: any) {
    return { success: false as const, message: sanitizeError(error) };
  }
}

