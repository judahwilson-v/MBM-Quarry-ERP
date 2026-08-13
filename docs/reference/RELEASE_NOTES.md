# MBM Quarry ERP — Release Notes

## v1.16.2 — Root Directory Cleanup & Artifact Removal (2026-08-13)
- **Root Directory Cleanup**: Moved 15 un-nested root scratch and test scripts (`check_*.js`, `add_*.js`, `test_*.js`, `fix_*.js`) into the designated `scratch/` directory.
- **Artifact Removal**: Removed stale `latest.yml` root artifact and added it to `.gitignore` to prevent future build pollution.

## v1.16.1 — Party Ledger Optimization, Non-Blocking Sync & Partial Sync UX (2026-08-13)
- **Party Ledger Bulk Creation**: Replaced sequential N+1 `create` queries in `recalculatePartyLedger` with bulk `createMany` operation to accelerate balance recalculations.
- **Non-Blocking Background Auto-Sync**: Wrapped `triggerAutoSync()` in non-blocking `setTimeout(..., 0)` calls across server actions to prevent local UI response latency from blocking on background Supabase sync network calls.
- **Partial Sync State Handling**: Added `PARTIAL_SUCCESS` status tracking to `pushSync()` and `pullSync()` in `sync-service.ts` and updated `app-shell.tsx` header indicator for improved UI feedback during row-level quarantine events.

## v1.16.0 — Cross-Validation Audit & Defect Remediation (2026-08-07)
- **Milestone 1: Supabase Index Matching**:
  - Matched all `@@index` annotations in `schema_pg.prisma` with Supabase schema indices.
- **Milestone 2: Form Validation Alignment**:
  - Fixed sequence rollover logic in `sales-entry-form.tsx` to strictly use 100-page rollover.
- **Milestone 3: Engine Hours Constraint**:
  - Enforced `num >= 0` constraint in `schemas.ts` to prevent negative engine hours entries.
- **Milestone 4: Defect Remediation**:
  - Resolved and cataloged KB-029 and KB-030 in `KNOWN_BUGS.md`.
- **Milestone 5 & 6: Verification & Desktop Package**:
  - Successfully verified build and packaged Windows executable `MBM Quarry V2 Setup 1.16.0.exe`.

## v1.15.0 — Permanent Sync Engine Fixes & Topological Dependency Architecture (2026-08-06)
- **Milestone 1: Cloud Schema & Root Cause Resolution**:
  - Added missing tables `weighbridge_tickets`, `maintenance_records`, `maintenance_schedules`, and `vehicle_stats` to cloud PostgreSQL schema (`prisma/schema_pg.prisma`) and SQL migration script (`docs/supabase_sync_fix_RUNME.sql`).
  - Added `@map("ticket_type")` mapping to `WeighbridgeTicket.ticketType` field in Prisma schema to resolve PostgREST database column naming mismatches.
  - Fixed numeric arithmetic for `ticketNumber` ID assignment in `sync-service.ts` to send genuine integer values instead of string-concatenated values, eliminating PostgREST integer syntax errors.
- **Milestone 2: Multi-Tier Error Boundaries & Adaptive UI Polling**:
  - Installed 3 tiers of error boundaries (Service level, Table level in `pullSync()`, and Row level in `pushSync()` and `pullSync()`) returning structured `SyncResult` summary objects `{ pushed, pulled, skipped, errors, status }`.
  - Guaranteed that fatal row or table errors never crash the sync engine or block healthy tables, quarantining poison pill rows in `SyncDeadLetter` and advancing sync cursors safely.
  - Updated UI polling in `src/components/app-shell.tsx` with adaptive exponential backoff (10s base up to 5 minutes max) on sync errors to prevent tight polling loops.
- **Milestone 3: Constraint Audit, Topological Order & FK Holding Queue**:
  - Enforced a 29-table parent-first topological dependency order via `PUSH_PRIORITY` map (1..29) and `PULL_ORDER` array in `src/lib/sync/sync-config.ts`, ensuring parent records (e.g. `OutgoingSale`) are always processed before child records (e.g. `PartyCredit`).
  - Expanded `REMOTE_CONFLICT_COLUMNS` and `LOCAL_CONFLICT_FIELDS` to cover all 29 models (including 16 unique-constrained models like `vehicle_number`, `party_name`, `ticket_number`, `serial_number`, `source_event_id`).
  - Implemented an FK Holding Queue with up to 3 retry passes within `pushSync()` for child records awaiting parents, bounded by `earliestSkippedTime` cursor tracking so `lastSyncedAt` never skips un-pushed records.
  - Fixed ISO date parsing regex in `toCamelCase()` to support `Z` and timezone offsets (e.g. `+05:30`), and introduced a 10-second safety window (`SAFETY_WINDOW_MS = 10000`) subtracted from sync cursors to protect against device clock skew.
- **Milestone 4: Verification & Final Quality Assurance**:
  - Verified clean TypeScript compilation (`npx tsc --noEmit`) with **0 errors**.
  - Verified clean ESLint check (`npx eslint src/ --quiet`) with **0 errors**.
  - Synchronized all project documentation files (`KNOWN_BUGS.md`, `PROJECT_STATE.md`, `CHANGELOG.md`).
