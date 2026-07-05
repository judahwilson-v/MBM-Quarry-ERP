# MBM Quarry ERP — Changelog

## Phase A Release — Cloud Sync & Operational Dashboards (2026-07-06)
**Robust Cloud Sync Engine**
- **Two-Way Offline-First Sync**: Replaced unstable syncing with a robust audit queue tracking offline mutations for ordered cloud push on reconnection.
- **Full Database Security (RLS)**: Deployed Row Level Security (RLS) across all 28 tables with secure authenticated Supabase access, moving away from anonymous access.
- **Timestamp-Aware Projections**: Advanced sync logic for financial events, ledger entries, and inventory stock to prevent balance corruption.

**Live Operational Dashboard**
- **Real-Time Metrics**: Replaced hardcoded placeholders with a new `DashboardService` calculating live metrics (Today's Sales/Purchases/Expenses, Receivables/Payables, Cash/Bank balances) in milliseconds from SQLite.
- **Local Time Precision**: Fixed timezone issues to correctly attribute transactions at local day boundaries rather than UTC.

**Real-Time UI & Navigation**
- **Dynamic Status Indicators**: Sidebar and top bar now display live sync status (Synced, Syncing..., Error), pending offline changes count, and last successful sync time.

**Dynamic System Health**
- **About Page Revamp**: Upgraded from static text to a live diagnostic dashboard probing SQLite, Prisma, and Supabase connection health.

## v1.9.7 (2026-07-05)
- Corrected audit payload extraction so cloud upserts receive the entity snapshot rather than the audit wrapper.
- Added the `Sale` → `OutgoingSale` alias and lower-camel Prisma delegate mappings used by pull sync.
- Stopped pull cursors from advancing after failed local upserts or deletions.
- Added timestamp-aware push/pull support for financial events, ledger entries, inventory stock, and inventory transactions.
- Added the missing inventory tables, global settings PIN columns, authenticated RLS policy script, and focused sync configuration tests.
- Switched synchronization to the signed-in server-side Supabase client; anonymous database access is no longer required.
- Persisted browser authentication in SSR-compatible cookies so Server Actions can satisfy authenticated RLS policies.
- Replaced hardcoded About-page versions and health flags with live package, migration, SQLite, authentication, and Supabase checks.
- Connected the dashboard to live daily/monthly sales, purchase, expense, party-balance, day-book, and sync metrics using local-time date boundaries.

## v1.9.6 (2026-07-04)
- **UI & Validation Fixes**: Fixed manual update UI logic, added sales quantity validation, and corrected offline sync button behavior.

## v1.9.5 (2026-07-04)
- **Two-Way Sync**: Implemented professional two-way sync with robust deletion tracking via `audit_logs`.
- **IPC Cleanup**: Returned cleanup function from `ipcRenderer` listeners to prevent React `useEffect` destroy errors.
- **UI UX Polish**: Globally hid number input spin buttons for a cleaner, professional ERP look.
- **Relaxed Form Validations**: Relaxed compulsory vehicle and party name validation for forms.
- **Client-side Validations**: Added robust client-side validation to prevent unhandled Server Action errors.

## v1.9.4 (2026-07-04)
- **Auto-Updater React UI**: Implemented modern React UI for the auto-updater.

## v1.9.3 (2026-07-04)
- **Chore**: Stability releases and bug fixes.

## v1.9.1 (2026-07-04)
- **Chore**: Incremental releases.

## v1.9.0 (2026-06-27)
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
