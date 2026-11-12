"use server";
import { createSyncClient } from '@/lib/supabase/client-sync';

// Connectivity means this installation's authenticated sync route works,
// not that an intentionally denied anonymous business-table request succeeds.
export async function checkOnlineStatus(): Promise<boolean> {
  try {
    const client = await createSyncClient();
    const { error } = await client.from('global_settings').select('id', { head: true }).limit(0);
    return !error;
  } catch {
    return false;
  }
}
