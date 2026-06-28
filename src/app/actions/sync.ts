"use server";

import { pushSync, getSyncStatus } from "@/lib/sync/sync-service";
import { revalidatePath } from "next/cache";

export async function triggerSync() {
  const result = await pushSync();
  revalidatePath("/", "layout");
  return result;
}

export async function fetchSyncStatus() {
  return await getSyncStatus();
}
