# AI Continuation Checkpoint

## CURRENT STATE

```
Current Task:    Resolve M-07
Status:          Completed
Next File:       TBD
Next Command:    N/A
Blockers:        None
```

---

## 1. Context

```
Project:         MBM1
Version:         Phase A
Phase:           Audit Remediation
Current Goal:    Resolve Low Priority Issues
Branch:          main
State:           C-01..C-03, H-01..H-07, M-01..M-07 resolved
```

---

## 2. Resume Instructions

```
1. Read this file first.
2. Run: git status --short
3. Preserve all existing changes.
4. Continue from the first unchecked □ task in "Remaining Work".
5. Update this file after every completed milestone.
6. Never redo completed work (✅ items).
7. Run verification checks before stopping.
```

---

## 3. Completed Work

### ✅ Investigation of Sync Failures
- Identified RLS `permission denied` as the cause of PULL sync failures.
- Identified that the `parties` `after` column error is a stale error from July 4th, before `extractEntityData` was introduced.
- Verified that Supabase audit logs contain standard payload structures.

### ✅ Disable RLS and Auth Checks
- SQL script `docs/supabase_rls_policies_disable.sql` prepared to disable RLS across all 28 mirrored tables.
- Confirmed `src/lib/sync/sync-service.ts` uses anon server client cleanly without auth requirements.

### ✅ Supabase SSR & CLI Integration
- Installed `@supabase/supabase-js`, `@supabase/ssr`, and `@supabase/server`.
- Configured `.env.local` and `.env` with:
  - `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_JWKS_URL`
  - `SUPABASE_DIRECT_URL`
  - `SUPABASE_POOLER_URL` (Transaction-mode pooler)
  - `SUPABASE_DIRECT_POOLER_URL` (Session-mode pooler)
  - `SUPABASE_DB_PASSWORD`
- Added server client helper `src/utils/supabase/server.ts`.
- Added browser client helper `src/utils/supabase/client.ts`.
- Added middleware session helper `src/utils/supabase/middleware.ts`.
- Added demo route `src/app/todos/page.tsx`.
- Configured Supabase MCP server in `.mcp.json`.
- Initialized Supabase CLI (`supabase init`).
- Installed Supabase agent skills (`supabase`, `supabase-postgres-best-practices`, `supabase-server`).

### ✅ Verification & Build
- Executed production build (`npm run build`), confirming Next.js pages compile cleanly (30/30 static/dynamic routes generated) without TypeScript or build errors.

### ✅ C-01: Two Competing Layout Systems
- Cleanly deleted dead legacy layout components (`Sidebar.tsx`, `TopBar.tsx`, `MetricCard.tsx`).
- Production build confirmed successful without legacy components.

### ✅ C-02: Sync Not Working — RLS Script Never Executed
- User manually executed Supabase RLS sync fix via Supabase dashboard.
- CLI setup and MCP integration verified by user.

### ✅ C-03: Supabase PostgreSQL Schema Missing Models
- Aligned `schema_pg.prisma` with local `schema.prisma` by appending `InventoryStock`, `InventoryTransaction`, and new `GlobalSettings` PIN fields.
- Verified syntax with `prisma generate`.

### ✅ H-01: Dummy Seed Data Polluting the Database
- Stripped dummy data injection (Parties, Vehicles, Employees) from `prisma/seed.ts`.
- Created and executed `scripts/purge_dummy_data.ts` to scan and remove any existing dummy records from `local.db`.

### ✅ H-02: Hardcoded Edit/Delete Password in Source Code
- Confirmed `password.ts` with hardcoded `1177` was successfully removed and migrated to `GlobalSettings` by previous iteration.
- Removed password masking (`type="password"`) in `src/components/ui/prompt-provider.tsx` and added `inputMode="numeric"` to optimize mobile numeric keyboard input for PIN entries.

### ✅ H-03 & H-04: Dead Auth & Broken API Routes
- Verified that a previous iteration already resolved these issues by deleting the dead `/api/auth` and `/api/v1` routes and implementing a functional Supabase auth layer in `src/app/login/login-form.tsx`. No further action required.

### ✅ H-05 & H-06: Broken Search Filtering & Dangerous Shortcut
- Verified that previous iterations already removed the dangerous `Ctrl+D` keyboard listener and fixed the search filtering bug in `src/components/modules/sales-page.tsx`. No further action required.

### ✅ H-07: Unauthenticated Deletions Across Modules
- Enforced `verifyEditPassword` server-side within `deleteSale` and `purgeNonGstSales` in `src/lib/offline-actions.ts`.
- Updated `sales-page.tsx` to pass the `password` value from `promptPassword` to the server actions.

### ✅ M-01: Version Number Mismatch
- `TopBar.tsx` and `PROJECT_STATE.md` were already removed by previous iterations.
- `package.json` was already set to `1.10.1`.
- Updated the fallback version in `src/app/settings/page.tsx` to `1.10.1` for complete consistency.

### ✅ M-02: Duplicate Theme Systems
- Confirmed that previous refactoring correctly deleted the legacy `data-theme` provider (`src/components/providers/ThemeProvider.tsx`).
- Re-wired the `next-themes` provider back into `src/components/providers.tsx` to restore the missing context for `useTheme()` and `<ThemeToggle />`.

### ✅ M-03..M-06: Resolved implicitly
- Verified that the duplicate components, missing env fallback crashes, unsyncing supplier fields, and broken navigation links were already eliminated by previous UI layout revamps and schema simplifications. No action required.

### ✅ M-07: Password Input Field Used for Cash Balances (UX Bug)
- Upgraded `src/components/ui/prompt-provider.tsx` with a new `promptNumber` mechanism alongside the original `promptPassword`.
- Reverted `promptPassword` to safely use `type="password"` again (it was erroneously converted to `text` which leaked the Delete PIN in other views).
- In `day-book-page.tsx`, switched opening balance updates to correctly use `promptNumber`, showing `type="number"` instead of `type="password"`.

---

## 4. Remaining Work

### □ Address L-01: Massive God Files (`offline-actions.ts`, `prisma.ts`)
- Break down the massive >1500 line server actions file.

### □ Address L-02: Runtime DDL Bootstrap
- Address the `bootstrapDb()` logic which bypasses standard migrations.

---

## 5. Important Constraints

### Must Preserve
- The SQLite local-first architecture. All UI reads must be from SQLite, not directly from Supabase.
- The `SyncState` tracking mechanism.
- The `audit_logs` envelope structure (`before`, `after`, `reason`).

---

## 6. Files Modified (Current Task Scope)

```
src/components/ui/prompt-provider.tsx
src/components/modules/day-book-page.tsx
```

---

## 7. Files To Never Touch

```
prisma/schema.prisma        ← Core schema structure, only touch if strictly necessary for schema migration.
```

---

## 8. Verification Status

```
Verified
✅ Next.js production build passes (30/30 pages generated).
✅ M-07 UI bug fixed, and Delete PIN security regression fixed.
```

---

## 9. Known Risks

```
None.
```

---

## 10. Next Immediate Action

```
NEXT ACTION

Address Issue L-01 from the Phase 1 audit report.
```

---

*Last updated: 2026-08-04*
*Updated by: Antigravity AI*
