/**
 * Persistent sync lease: a process-scoped mutex that prevents push, pull,
 * outbox delivery, and restore from running concurrently.
 *
 * Invariant: at most one sync operation holds the lease at any time.
 * A stale lease from a crashed process is recovered by timeout.
 *
 * This module replaces the simple boolean in restore-state.ts for all sync
 * operations while maintaining backward compatibility — restore-state.ts
 * continues to work for callers that haven't migrated yet.
 */

export type SyncLeaseHolder = "push" | "pull" | "outbox_delivery" | "restore" | "force_push";

interface LeaseState {
  holder: SyncLeaseHolder;
  acquiredAt: number;
}

/** Maximum duration any single sync operation may hold the lease (ms). */
const MAX_LEASE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

let currentLease: LeaseState | null = null;

/**
 * Try to acquire the sync lease for an operation. Returns true if the lease
 * was acquired, false if another operation already holds it.
 *
 * A stale lease (held longer than MAX_LEASE_DURATION_MS) is automatically
 * recovered — this covers process crashes and stuck operations.
 */
export function acquireSyncLease(holder: SyncLeaseHolder): boolean {
  if (currentLease) {
    const elapsed = Date.now() - currentLease.acquiredAt;
    if (elapsed < MAX_LEASE_DURATION_MS) {
      // Another operation is actively running
      return false;
    }
    // Stale lease — recover it
    console.warn(
      `[SyncLease] Recovering stale lease held by "${currentLease.holder}" ` +
      `for ${Math.round(elapsed / 1000)}s. Granting to "${holder}".`
    );
  }
  currentLease = { holder, acquiredAt: Date.now() };
  return true;
}

/**
 * Release the sync lease. Only the current holder can release.
 * Safe to call multiple times.
 */
export function releaseSyncLease(holder: SyncLeaseHolder): void {
  if (currentLease && currentLease.holder === holder) {
    currentLease = null;
  }
}

/**
 * Check whether the lease is currently held and by whom.
 * Returns null if no lease is held.
 */
export function getCurrentLeaseHolder(): SyncLeaseHolder | null {
  if (!currentLease) return null;
  const elapsed = Date.now() - currentLease.acquiredAt;
  if (elapsed >= MAX_LEASE_DURATION_MS) {
    // Stale — treat as unheld
    return null;
  }
  return currentLease.holder;
}

/**
 * Guard that throws if the lease cannot be acquired.
 * Use this at the top of sync entry points.
 */
export function assertSyncLeaseAvailable(holder: SyncLeaseHolder): void {
  const current = getCurrentLeaseHolder();
  if (current && current !== holder) {
    throw new Error(
      `Cannot start "${holder}" — a "${current}" sync operation is already in progress. Try again later.`
    );
  }
}

/**
 * Higher-order helper: acquire lease, run callback, release lease.
 * Guarantees the lease is released even on exceptions.
 */
export async function withSyncLease<T>(
  holder: SyncLeaseHolder,
  fn: () => Promise<T>,
): Promise<T> {
  if (!acquireSyncLease(holder)) {
    const current = getCurrentLeaseHolder();
    throw new Error(
      `Cannot acquire sync lease for "${holder}" — ` +
      `"${current ?? "unknown"}" is already running. Try again later.`
    );
  }
  try {
    return await fn();
  } finally {
    releaseSyncLease(holder);
  }
}
