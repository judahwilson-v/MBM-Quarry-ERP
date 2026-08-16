# MBM Quarry ERP — Release Notes

## v2.2.0 — ACID Atomicity Fixes, Next.js Boot Fix & Structural Refactoring (2026-08-16)
- **ACID Transaction Atomicity Fixes**: Removed swallowed `try/catch` wrappers around relational cleanup hooks (e.g., `decrementVehicleTrips`, `recalculatePartyLedger`, `txAdjustInventoryStock`) across all domain actions. This allows Prisma to natively abort and rollback the `$transaction` on error, ensuring ledgers and inventory remain in perfect parity.
- **Next.js Boot Sequence Fix**: Converted the dynamic `require("./generated/bootstrap-ddl.json")` in `bootstrap.ts` to a static ES6 import, permanently resolving the Next.js timeout crash during Electron boot in production.
- **UI Consistency & Dialog Prompts**: Replaced legacy blocking native `confirm()` and `prompt()` browser dialogs on the Employees page with the internal React-driven `@/components/ui/prompt-provider`.
- **Route Orchestration & Cleanups**: Cleaned dead imports, deleted the orphaned `src/app/settings/users/` directory, and properly co-located 5 out-of-tree settings components into `src/app/settings/general/`.
- **Verification & Pipeline Checks**: All static analysis passing. Passed all tests, `tsc --noEmit` checks, and ESLint checks with zero warnings/errors.

## v2.1.0 — Architecture Polish & Build Fixes (2026-08-16)
- **Build Architecture**: Resolved broken imports in settings/general and sync route.
- **Data Deprecation**: Removed deprecated time field from data schemas to enforce unified datetime standards.

## v2.0.0 — Master Quality, Resilience & UI Polish Overhaul (2026-08-16)
## v1.16.5 — Single Source of Truth, Automated Test Suite & CI/CD Pipeline (2026-08-14)
- **Single Source of Truth Architecture**: Consolidated schema management to `prisma/schema.prisma` with automatic generator pipeline (`generate-bootstrap-ddl.js`, `generate-pg-schema.js`, `generate-supabase-sql.js`, `generate-sync-map.js`) and reduced `bootstrap.ts` from 794 lines to 290 lines.
- **Automated Drift Detection & Test Suite**: Added Vitest test runner with 17 tests detecting multi-source schema drift in real-time.
- **CI/CD Pipeline**: Configured GitHub Actions CI workflow to validate tests, type checks, and production builds on push.
- **Security & Repo Sanitization**: Removed `.env` and `.env.production` from Git tracking and updated `.gitignore` for secret leakage prevention.

## v1.16.4 — Infinite Sync Loop Fix (2026-08-14)
- **Infinite Sync Loop Fix**: Disabled `SAFETY_WINDOW_MS` in `src/lib/sync/sync-service.ts` to prevent the perpetual "pending changes" issue caused by the cursor intentionally lagging behind and repeatedly reprocessing the same logs.

## v1.16.2 — Sync Deadlock Resolution & Artifact Removal (2026-08-13 07:56 PM)
- **Sync Deadlock Resolution**: Fixed critical deadlock in `sync-service.ts` where FK violations caused `recordSkippedTime()` to permanently pin the `lastSyncedAt` cursor in the past, causing an infinite loop. The sync engine now safely advances the cursor past failing records.
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
