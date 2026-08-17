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
  try {
    const { getDb } = await import("@/lib/prisma");
    const db = await getDb();
    await db.syncState.update({
      where: { id: "default" },
      data: { lastSyncedAt: new Date(0), status: "IDLE", lastError: null }
    });
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    const { sanitizeError } = await import("@/lib/utils/sanitize-error");
    return { success: false, error: sanitizeError(error) };
  }
}

export async function checkRestoreEligibility() {
  const { checkRestoreEligibility: check } = await import("@/lib/sync/sync-service");
  return check();
}

export async function performFullRestore(options?: { force?: boolean }) {
  const { fullRestoreFromSupabase } = await import("@/lib/sync/sync-service");
  const result = await fullRestoreFromSupabase(options);
  revalidatePath("/", "layout");
  return result;
}

