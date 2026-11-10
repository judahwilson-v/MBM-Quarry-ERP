/** Shared client-side in-flight gate. Server sync lease remains authoritative
 * across windows and automatic saves. Only active pending work triggers retry;
 * parked outbox history and an online status check alone never cause delivery.
 */
export async function deliverPendingOnPoll(
  status: { pendingCount?: number; status?: string } | null,
  online: boolean,
  busy: { current: boolean },
  deliver: () => Promise<unknown>,
): Promise<boolean> {
  if (!online || !status || !status.pendingCount || status.pendingCount < 1 || status.status === 'SYNCING' || busy.current) return false;
  busy.current = true;
  try { await deliver(); return true; }
  finally { busy.current = false; }
}
