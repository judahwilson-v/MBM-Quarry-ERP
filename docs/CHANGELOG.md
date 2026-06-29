# MBM Quarry ERP — Changelog

## RC1 — v0.1.0-rc1 (2026-06-27)
- **Settings Page**: Added `GlobalSettings` Prisma model and Settings UI for Quarry Name, GST Number, Address, Phone, Default Printer, Backup Folder.
- **Backup Manager**: Full backup/restore/export/import for SQLite database accessible from the About page.
- **VERSION Stamping**: `prebuild` hook auto-stamps `VERSION` file with current date/time on every `electron:package` run.
- **About Page Revamp**: System health checklist (Offline Ready, Cloud Sync, SQLite Connected) with version metadata display.
- **Documentation Cleanup**: Reorganized all `.md` files into `docs/` with clear structure. Obsolete files moved to `docs/archive/`.

## Phase 6 — Electron Desktop Packaging
- Configured Next.js for `output: standalone`.
- Packaged full production Next.js server into an Electron container via `electron-builder`.
- `main.js` auto-relocates Prisma database into the persistent `userData` directory on first launch.
- Built macOS DMG executable.

## Phase 5 — Supabase Sync
- Implemented offline-first synchronization logic via `SyncState` and audit queue.
- Created `supabase_schema.sql` for 1:1 database mirroring.
- Integrated `@supabase/supabase-js`.
- Protected the owner dashboard route (`/`) with Supabase authentication.
- Created `Sync Now` sidebar button with dynamic syncing status indicators.

## Phase 4 — Credit & Collections
- Party credit auto-derived from sales remaining balance.
- Party collections reduce outstanding balances.
- Party ledger projection (debit/credit/running balance).
- Employee credit tracking (advances, expected due dates).
- Other credit tracking.

## Phase 3 — Day Book & Expenses
- Day book per business day with opening/closing cash and bank balances.
- Expenses linked to parties and vehicles.
- Financial event architecture underpinning all monetary actions.

## Phase 2 — Boulder Purchases
- Incoming boulder (purchase) register.
- Split payment support (cash/bank/GPay).
- Vehicle rent and combined payment flags.

## Phase 1 — Sales Engine (1.1A – 1.1C)
- Sales business engine with vehicle quantity defaults, material rate defaults, split payments, remaining credit, and trip counting.
- Edit password `1177` protection.
- Audit logging for mutations.
- Full financial event infrastructure beneath the application.

## Phase 0 — Foundation
- Offline SQLite + Prisma baseline.
- Normalized database schema without breaking existing routes.
- Source-of-truth documentation established.
