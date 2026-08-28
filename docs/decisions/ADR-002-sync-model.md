---
type: adr
last_updated: 2026-08-28
status: SUPERSEDED_IN_PART (Phased Outbox Architecture)
---
# ADR-002: Sync Model Architecture & Transactional Outbox

## Context
Operating offline-first with a local SQLite database requires a mechanism to periodically synchronize data with a central cloud database (Supabase) to support multi-device scenarios and the separate Owner Dashboard. 

The legacy sync model relied on CDC audit log triggers and timestamp cursors (`lastSyncedAt`). Under flaky network conditions and high transaction loads, this caused lost records, race conditions during auto-sync, and undesirable collision name mutations (e.g. `(Merge XXXX)`).

## Decision
We evolved the synchronization model into an **ACID-Compliant Transactional Outbox Engine** with the following principles:

1. **Transactional Outbox (`sync_outbox_events`)**:
   - Every local domain mutation (create, update, delete) atomically records an immutable event in `sync_outbox_events` inside the primary SQLite `$transaction`.
   - Business data changes and outbox events succeed or fail together.

2. **Idempotent Cloud Ingestion (`apply_outbox_event` RPC)**:
   - Events are dispatched with a UUID primary key, hardware-anchored `deviceId`, entity type, operation, and JSON payload.
   - The cloud database validates incoming events against `sync_event_inbox`. Duplicate deliveries (e.g., due to network ACK drop) are acknowledged safely with zero duplicate writes.

3. **Domain Cutover Gate (`src/lib/sync/delivery-gate.ts`)**:
   - Master data and transactional models are cut over domain-by-domain from legacy push to outbox delivery.
   - For cut-over models, legacy push mutations and unverified pull row-copying are disabled.

4. **Sync Lease Mutual Exclusion (`withSyncLease`)**:
   - In-memory and state-backed leases prevent concurrent pushes, pulls, restores, and outbox dispatches from colliding.

5. **Retired Operations**:
   - `forcePushAllTables`, `resetSyncCursor`, and `resetSyncQueue` are permanently hard-disabled and fail closed with `{ success: false, code: "RETIRED_OPERATION" }`.
   - Silent entity renaming (`(Merge XXXX)`) is eliminated.

6. **Safe Staged Restore Engine (`src/lib/sync/staged-restore.ts`)**:
   - Cloud restores populate an isolated `.stage.db` temporary database, verify foreign key integrity, create a `.bak` local backup, and execute an atomic file swap.

## Consequences
- Zero data loss from interrupted network connections or background sync races.
- Deterministic, traceable audit trail for all multi-device updates.
- No silent renaming or data mutation of business records.
- Staged recovery protects production SQLite databases against corrupt network downloads.
