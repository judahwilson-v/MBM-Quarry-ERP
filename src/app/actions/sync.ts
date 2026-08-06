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
