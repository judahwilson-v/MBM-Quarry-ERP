"use server";

import { pushSync } from "./sync-service";
import { checkOnlineStatus } from "./connectivity";

/**
 * Fire-and-forget sync push.  Call this after every local save/delete
 * so data reaches Supabase immediately when the network is available.
 *
 * If the network is down, this silently does nothing — data stays safe
 * in local SQLite and will sync the next time the user is online.
 */
export async function triggerAutoSync(): Promise<void> {
  try {
    const online = await checkOnlineStatus();
    if (!online) return; // offline — skip silently

    await pushSync();
  } catch (error) {
    // Never throw from auto-sync — it must not break the caller's save flow
    console.error("[Auto-Sync] Background push failed (will retry later):", error);
  }
}
