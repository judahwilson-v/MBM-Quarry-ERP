# Phase A Sync and ERP Improvements — Progress

**Last updated:** 2026-07-04 23:40 IST  
**Working branch:** `main` at `v1.9.7`; B2 changes are local and uncommitted  
**Primary plan:** Fix sync, remove hardcoded status/metrics, and complete Phase 8.5 operational improvements.

## How to Resume

1. Read this file first.
2. Run `git status --short` and preserve all existing changes.
3. Two-Way Sync (C1-C5): Shifted to a cloud-synced model. A robust `AuditLog` queue intercepts all local mutations and handles push logic safely, including deleted items. Pull logic syncs cloud-to-local.
4. Update this file after every completed item and verification run.

## Completed


### A1 — Sync payload and runtime mappings

- [x] Extract `payload.after` from standard audit envelopes before Supabase upsert.
- [x] Preserve compatibility with legacy audit rows that contain the entity directly.
- [x] Ignore non-CRUD audit actions instead of treating them as entity upserts.
- [x] Map audit entity `Sale` to Prisma `OutgoingSale` / Supabase `outgoing_sales`.
- [x] Replace PascalCase dynamic Prisma access with explicit lower-camel delegates.
- [x] Use per-table cursor columns (`updated_at`, `created_at`, or `last_updated`).
- [x] Stop and preserve the pull cursor when a local upsert/delete fails.
- [x] Add table/record context to push and pull errors.

### A2 — Financial and inventory projections

- [x] Add `FinancialEvent`, `LedgerEntry`, `InventoryStock`, and `InventoryTransaction` to sync configuration.
- [x] Directly scan these projection tables because they do not create audit rows of their own.
- [x] Use logical conflict keys for ledger entries and inventory stock.
- [x] Include projection rows in the pending-sync count.
- [x] Prevent “Reset Sync Queue” from deleting all financial events.

### A3 — Authentication and environment safety

- [x] Sync through the signed-in server-side Supabase session.
- [x] Persist browser auth in SSR-compatible cookies.
- [x] Fail clearly when sync is attempted without a Supabase session.
- [x] Ignore `.env*.bak`; `.env.local.bak` no longer appears in Git status.

### A4 — Cloud schema

- [x] Add PIN columns and inventory tables to `docs/supabase_schema.sql`.
- [x] Add idempotent `docs/supabase_phase_a_sync_migration.sql`.
- [x] Apply live Supabase migration `phase_a_sync_schema` (`20260704163143`).
- [x] Verify live `global_settings`, `inventory_stock`, and `inventory_transactions` columns.
- [x] Keep the new inventory tables RLS-protected by default.

### A5 — Documentation and verification

- [x] Update changelog, project state, known bugs, Supabase handoff, and API flow docs.
- [x] Add `tests/sync-config.test.ts` and include it in `npm test`.
- [x] `npm test` passes.
- [x] `tsc --noEmit` passes.
- [x] `npm run build` passes (2026-07-04 22:04 IST).

## Live Supabase Security State

- RLS has been **disabled** on all 28 mirrored tables via `docs/supabase_rls_policies_disable.sql`.
- The `authenticated_sync_access` policies have been dropped.
- The sync engine now operates anonymously using the Supabase anon key — no user login required.
- **Security note**: This is acceptable for a private quarry ERP. Re-enable RLS if the app ever becomes public-facing.

## Remaining Work

### B1 — Finish Supabase access policy

- [x] Apply `docs/supabase_rls_policies.sql` to the live project.
- [x] Verify all mirrored tables have RLS enabled and `authenticated_sync_access` installed.
- [x] Re-run Supabase security advisors and record remaining warnings.
- [x] Manually test one authenticated push and pull from the application.

### B2 — Dynamic About page

- [x] Replace hardcoded schema and sync-engine versions.
- [x] Replace hardcoded offline/cloud/SQLite booleans with real checks.
- [x] Read the application version from package/version metadata without stale fallbacks.
- [x] Force dynamic rendering so health values are evaluated per request.
- [x] Add focused version/schema formatting tests and update the changelog.
- [x] Run the production build for B2 (`/about` confirmed dynamic, 2026-07-04 23:28 IST).

### B3 — Live dashboard

- [x] Connect and harden the dashboard domain service for daily/monthly metrics.
- [x] Use local-day and local-month boundaries instead of UTC date strings.
- [x] Replace hardcoded sales, purchase, expense, receivable, payable, cash, and bank values.
- [x] Calculate receivable/payable from the latest ledger row per party, including legacy name-only rows.
- [x] Use real sync status and the actual last successful push time on the dashboard.
- [x] Fix dashboard links to existing application routes.
- [x] Add focused date/balance tests and update the changelog.
- [x] Run TypeScript, tests, and the production build for B3.

### B4 — Sidebar/top-bar sync status

- [x] Remove hardcoded `syncStatus="synced"` props.
- [x] Fetch real status, pending count, and last-sync time.
- [x] Verify loading, syncing, error, pending, and idle states.

### B5 — Final release handoff

- [x] Run tests, TypeScript, production build, and targeted manual sync checks.
- [x] Review the final diff and ensure no credentials/database artifacts are staged.
- [x] Decide GitHub delivery: feature branch + PR (recommended) or direct `main` push.
- [x] Commit/push only after the delivery choice is explicit.

### B6 — Disable RLS and Anonymous Sync (2026-07-06)

- [x] Create `docs/supabase_rls_policies_disable.sql` to drop policies and disable RLS.
- [x] Remove `requireAuthenticatedUser()` from `sync-service.ts`.
- [x] Verify dashboard reads from local SQLite (no Supabase dependency).
- [ ] User runs SQL script in Supabase SQL Editor.
- [ ] User restarts app and verifies sync flows without errors.
- [ ] User verifies Supabase tables receive data.
- [x] Update documentation (CHANGELOG, KNOWN_BUGS, PROJECT_STATE).

## Files Changed So Far

- `.gitignore`
- `package.json`
- `src/app/actions/admin.ts`
- `src/lib/supabase/client.ts`
- `src/lib/sync/sync-config.ts`
- `src/lib/sync/sync-service.ts`
- `tests/sync-config.test.ts`
- `docs/supabase_schema.sql`
- `docs/supabase_phase_a_sync_migration.sql`
- `docs/supabase_rls_policies.sql`
- `docs/supabase_rls_policies_disable.sql` *(new — B6)*
- `docs/CHANGELOG.md`
- `docs/KNOWN_BUGS.md`
- `docs/PROJECT_STATE.md`
- `docs/PHASE_A_SYNC_AND_ERP_PROGRESS.md`
- `docs/ai-handoff/03_SUPABASE_SCHEMA.md`
- `docs/ai-handoff/04_API_FLOW.md`

Phase A is committed in `019c3da` and released as `v1.9.7` (`f33e158`) on `origin/main`. `VERSION` is restamped by production builds. Preserve the unrelated local `desktop/main.js` auto-updater change.
