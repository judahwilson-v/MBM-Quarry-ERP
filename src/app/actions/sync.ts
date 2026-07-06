"use server";

import { pushSync, pullSync, getSyncStatus } from "@/lib/sync/sync-service";
import { checkOnlineStatus } from "@/lib/sync/connectivity";
import { revalidatePath } from "next/cache";

export async function triggerSync() {
  const pushResult = await pushSync();
  const pullResult = await pullSync();
  revalidatePath("/", "layout");
  return { pushed: pushResult.pushed, pulled: pullResult.pulled };
}

export async function fetchSyncStatus() {
  return await getSyncStatus();
}

export async function fetchOnlineStatus() {
  return await checkOnlineStatus();
}
