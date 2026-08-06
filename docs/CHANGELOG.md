# MBM Quarry ERP — Changelog

## v1.11.6 — Phase 13 Remediation (2026-08-06)
- **Input Validation**: Implemented Zod validation schemas (`SaleInputSchema`, `ExpenseInputSchema`, etc.) in `src/lib/validators/schemas.ts` and deployed them across all 5 primary Server Actions (`sales.ts`, `purchases.ts`, `expenses.ts`, `credits.ts`, `weighbridge.ts`).
- **UI Accessibility**: Added missing `aria-label`, `htmlFor`, and `id` bindings to 55+ form input, textarea, and checkbox controls across transaction and settings forms (KB-009).
- **Mobile Responsiveness**: Fixed element squishing on viewports <375px by enforcing mobile-first breakpoints (`grid-cols-1 sm:grid-cols-2`) and horizontal scroll flex wrappers in the bottom navigation (KB-010).
- **TypeScript Strictness**: Created `src/types/global.d.ts` to properly type `(window as any).electron`, removing `any` casts (KB-015). Validated the build with a clean `tsc --noEmit` pass.
- **Code Cleanliness**: Purged 267+ unused import and variable declarations across the 11 Server Action files via `eslint --fix` (KB-014).
- **DayBook Crash Guard**: Added nullish coalescing `data?.transfers ?? []` in `day-book-page.tsx` to handle cases where transfers array is undefined during initialization (KB-016).

## v1.11.5 — Comprehensive Codebase Audit & Defect Mapping (2026-08-05)
- **Multi-Agent Codebase Audit**: Executed a read-only codebase audit across 3 parallel categories (Type/Lint, Schema/DB/Server Actions, React/UI/Hydration). 0 source code files were modified. Identified 27 distinct findings (3 Critical, 8 High, 11 Medium, 5 Low).
- **Category 1 (Type / Lint Audit)**:
  - Identified **Dishonest Serialization Signature (`serialize<T>(value: T): T`)** across 11 Server Action files that claims to return `Date` objects while converting to ISO strings at runtime.
  - Mapped **18 Double Type Casts (`as unknown as T`)** in UI components hiding serialized schema mismatches.
  - Identified **Explicit `type Row = any` Aliases** in `employees-page.tsx`, `fuel-management-page.tsx`, `vehicle-expenses-page.tsx`.
  - Identified **267 ESLint `@typescript-eslint/no-unused-vars` errors** stemming from copy-pasted unused imports in Server Actions.
  - Mapped untyped `(window as any).electron` and `tx: any` transaction parameters.
- **Category 2 (Schema / DB / Server Actions Audit)**:
  - Identified **Critical Infinite Recursion Crash** in `src/app/actions/purchases.ts` (`runTx` calling itself recursively on `saveIncomingBoulder` / `deleteIncomingBoulder`).
  - Identified **Critical Missing SQLite Column `vehicles.engine_hours`** in `src/lib/bootstrap.ts` DDL causing runtime query crashes.
  - Discovered **Supabase Cloud Schema & Sync Desync** (`weighbridge_tickets`, `maintenance_records`, `maintenance_schedules`, `vehicle_stats` missing from `SYNC_MODEL_CONFIG` & `supabase_schema.sql`).
  - Mapped **Un-Transactional Multi-Step Mutations** in `sales.ts` and `purchases.ts` executing `upsertPartyByName` outside `$transaction`.
  - Identified **Complete Lack of Runtime Input Validation (Missing Zod Schemas)** across all Server Actions.
  - Found **Missing Delete PIN Checks** on `deleteIncomingBoulder`, `deletePartyCollection`, `deletePartyPayment`, and `resetSyncQueue`.
  - Identified **Orphaned DayBook Expense Entries** left behind on expense deletion.
- **Category 3 (React / UI / Hydration Audit)**:
  - Identified **Missing `suppressHydrationWarning` on `<html>`** in `src/app/layout.tsx` causing hydration warnings with `next-themes`.
  - Identified **Client Components Importing `@prisma/client`** directly without `import type` in `pending-tickets-table.tsx` and `weighbridge-forms.tsx`.
  - Mapped **Non-Deterministic `new Date()` Evaluation** in `useState` initializers (`tally-export-dashboard.tsx`).
  - Cataloged **55 Accessibility Gaps** (inputs missing `id`/`htmlFor` bindings and icon action buttons missing `aria-label`).
  - Identified **Mobile UI Grid Layout Squishing** on viewports <375px (`app-shell.tsx` `grid-cols-5`, `dashboard.tsx` `grid-cols-2`).
- **Documentation Updates**: Updated `docs/KNOWN_BUGS.md`, `docs/PROJECT_STATE.md`, and `docs/CHANGELOG.md` with full findings, root causes, and zero-regression fix recommendations.

## v1.11.5 Hotfix — 7-Agent Surgical Bug Fix (2026-08-05)
- **Runtime Crash Fix**: Fixed `runTx` infinite recursion stack overflow in `purchases.ts`.
- **Serialization Safety**: Replaced the dishonest `serialize<T>` function across 11 files with a single type-safe `Serialized<T>` generic utility to prevent disguised `Date` string bugs.
- **Transaction Safety**: Fixed sales and purchases upsert actions to use the `tx` client inside `$transaction` blocks instead of the global `prisma` client, preventing partial commits.
- **Authorization Verification**: Enforced `verifyEditPassword` checks when updating existing records in the sales and purchases upsert handlers.
- **Schema & SQLite Sync Fixes**: Added the missing `engine_hours` raw SQLite column and successfully synced `weighbridge_tickets`, `maintenance_records`, `maintenance_schedules`, and `vehicle_stats` into `SYNC_MODEL_CONFIG`.
- **UI Hydration Fixes**: Added `suppressHydrationWarning` to the root HTML layout, safely converted `new Date()` initializers to client-side mounts in the DayBook, and removed server-side Prisma binary imports from client components.
- **Hydration Crash Fix**: Fixed a silent `TypeError: Cannot read properties of null` crash on the Sales Entry Form material dropdown that caused the Server Components render error.

## v1.11.4 — Pull Sync & Hydration Fixes (2026-08-05)
- **Pull Sync ID Mapping**: Fixed a critical bug in `pullSync` where the `toCamelCase` function was empty, causing `prisma.material.upsert` to crash due to missing `materialName` arguments during pull operations.
- **Pull Sync Date Format**: Fixed `Invalid ISO-8601 DateTime` crash. Supabase drops the timezone 'Z' from timestamp columns, causing Prisma to reject them. Updated `toCamelCase` to automatically append 'Z' to incoming Supabase timestamps.
- **Pull Sync Unique Constraint**: Added a global intercept in `pullSync` for `P2002` (Unique Constraint) errors. If a remote pulled entity (like a vehicle or party) collides with a local unique name, it now gracefully appends `(Merge <id>)` and retries, mirroring the Push logic.
- **UI Hydration Mismatch**: Fixed a `Text content does not match server-rendered HTML` crash on the Sales Page caused by `new Date()` mismatching between server and client rendering by adding `suppressHydrationWarning`.
- **Security Settings**: Removed the hardcoded Master PIN override from the Security Settings page to strictly enforce Supabase Authentication.

## v1.11.3 — Zero-Regression Architecture & Emergency Startup Fixes (2026-08-05)
- **Startup Crash Fix**: Fixed Schema Desync where 3 Prisma fleet maintenance models (`MaintenanceRecord`, `MaintenanceSchedule`, `VehicleStats`) were missing from SQLite initialization in `bootstrap.ts`, causing fatal startup timeouts.
- **Sync Map Engine**: Replaced regex string transformation in `sync-service.ts` with build-time O(1) metadata schema generator (`generate-sync-map.js`) to guarantee exact 1:1 column mapping to Supabase.
- **Build Validation**: Added `validate-build.js` pre-package hook and runtime checks in Electron `main.js` to ensure critical assets (`preload.js`, `server.js`, `local.db`) are always present before boot.
- **Security Master Override**: Added offline Master PIN override (`master` / `mbm@admin2024`) for local POS Security Settings access without cloud auth dependencies.
- **Vercel Read-Only Fallback**: Updated `getGlobalSettings` to use `findUnique` read-only queries with graceful in-memory fallbacks to prevent Server Component 500 errors on read-only environments.
- **Vehicle Directory Cleanup**: Executed relational purge of vehicle directory table (`deleteMany`) while preserving foreign-key linked sales history (`onDelete: SetNull`).
- **Dark & Light Mode Polish**: Added WebKit `:-webkit-autofill` dark mode background overrides in `globals.css` and fixed `next-themes` SSR hydration mismatches in theme toggles.

## v1.11.2 — Auto-Updater Fixes & Sync Resilience (2026-08-05)
- **Auto-Updater**: Fixed race condition where update checks fired before the UI was loaded. Removed conflicting updater components. The UI now reliably prompts users to download updates.
- **Sync Fixes**: Replaced the publishable key with the correct JWT anon key in the environment to fix 401 Unauthorized errors.
- **Sync Resilience**: Added robust foreign-key dependency ordering to the sync engine (parents push before children), and added skip-and-retry logic for isolated FK violations to prevent blocking the queue.
- **User Interface**: Redesigned the DayBook "Current User" field to an elegant user badge.
- **User Logs**: Added a full User Logs / Audit Logs viewer page with date and entity filters.

## v1.11.0 — Major Feature Update (2026-08-04)
- **Phase 10 (Print/Export)**: Implemented Print & Export modules for reports and ledgers.
- **Phase 9 (Owner Dashboard)**: MBM Quarry Dashboard completed with live data integration.
- **Weighbridge Integration**: Added weighbridge feature with toggle (on/off) capabilities.
- **New Development Cycle**: Commenced a new set of phases (1-10) following the completion of the Auto-Updater UI.
- **Bug Fixes**: Fixed bugs across branches C, H, M, and L, and resolved `runTx` maximum call stack issues.
