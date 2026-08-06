# MBM Quarry ERP — Known Bugs & Edge Cases

## Active Issues

### Category 1: Type Safety & Linting Bugs

#### KB-011: Dishonest Serialization Signature (`serialize<T>(value: T): T`)
**Severity**: Critical (Resolved)  
**Description**: All 11 Server Action files under `src/app/actions/` define `serialize<T>(value: T): T`. The type signature claims to return the input model type (e.g. Prisma `OutgoingSale` with `Date` fields), but runtime converts `Date` to ISO `string`. TypeScript believes return objects contain `Date` instances, hiding client runtime string/Date bugs.  
**Resolution**: Replaced local `serialize` functions with a single shared `Serialized<T>` generic utility type in `src/lib/utils/serialize.ts` and updated action imports.

#### KB-012: Double Type Casts (`as unknown as TargetType`) Hiding API Schema Mismatches
**Severity**: High (Resolved)  
**Description**: 18 instances across UI components (`boulder-purchases-page.tsx`, `credit-pages.tsx`, `sales-page.tsx`, etc.) use double type casting (`(await listSales()) as unknown as SaleRow[]`) to bypass TypeScript compiler checks. Hides database and action return schema mismatches during build.  
**Resolution**: Define explicit DTO response types for Server Actions (`Serialized<PrismaType>`) and consume them directly in components without casting.

#### KB-013: Explicit Type Suppression Aliases (`type Row = any`)
**Severity**: High (Resolved)  
**Description**: `employees-page.tsx`, `fuel-management-page.tsx`, and `vehicle-expenses-page.tsx` define component-level row types as `any` (e.g. `type EmployeeRow = any;`), disabling autocomplete and type validation for entire page modules.  
**Resolution**: Replace `any` aliases with strict TypeScript interfaces matching domain models.

#### KB-014: Copy-Paste Unused Imports/Vars Header Across Server Actions (267 ESLint Errors)
**Severity**: Medium (Resolved)  
**Description**: A ~25-import boilerplate header was copy-pasted across all 11 Server Action files, importing unused domain engines, types, and helpers, generating 267 `@typescript-eslint/no-unused-vars` ESLint errors.  
**Resolution**: Run `npx eslint --fix` and purge unused imports/helpers across `src/app/actions/`.

#### KB-015: Untyped `(window as any).electron` & `tx: any` Transaction Client
**Severity**: Medium (Resolved)  
**Description**: Electron context bridge API is accessed via `(window as any).electron` across 5 UI files, and `tx: any` is used for Prisma transactions in inventory service without type declarations.  
**Resolution**: Create `src/types/global.d.ts` for `window.electron` and type transaction clients as `Prisma.TransactionClient`.

#### KB-016: Unhandled Null/Undefined Array Guarding in DayBook UI
**Severity**: Medium (Resolved)  
**Description**: `day-book-page.tsx:273` evaluates `data?.transfers?.length === 0`. When loading or `data` is undefined, `undefined === 0` evaluates to `false`, bypassing the empty state check and invoking `data?.transfers?.map(...)`.  
**Resolution**: Use nullish coalescing default: `const transfers = data?.transfers ?? [];`.

---

### Category 2: Schema, Database & Server Actions Bugs

#### KB-017: Infinite Recursion Stack Overflow Crash in `purchases.ts` `runTx`
**Severity**: Critical (Resolved)  
**Description**: In `src/app/actions/purchases.ts` line 136, `runTx` calls `return await runTx(txFn);` recursively without calling `db.$transaction`. Any call to `saveIncomingBoulder` or `deleteIncomingBoulder` causes a server stack overflow crash (`RangeError: Maximum call stack size exceeded`).  
**Resolution**: Replaced self-call with `return await db.$transaction(txFn);`.

#### KB-018: Missing Raw SQLite Column `vehicles.engine_hours` in Bootstrap DDL
**Severity**: Critical (Resolved)  
**Description**: `Vehicle.engineHours` is defined in `prisma/schema.prisma`, but `CREATE TABLE vehicles` and `ensureSQLiteColumn` in `src/lib/bootstrap.ts` omit `engine_hours`. Querying `engineHours` via Prisma on SQLite crashes with `SQLITE_ERROR: no such column: engine_hours`.  
**Resolution**: Added `engine_hours REAL` to `CREATE TABLE vehicles` and `ensureSQLiteColumn` in `bootstrap.ts`.

#### KB-019: Supabase Cloud Schema & Sync Config Desynchronization
**Severity**: High (Resolved)  
**Description**: `weighbridge_tickets`, `maintenance_records`, `maintenance_schedules`, and `vehicle_stats` tables exist locally in Prisma/SQLite but are missing from `SYNC_MODEL_CONFIG` in `src/lib/sync/sync-config.ts` and `docs/supabase_schema.sql`. Data created locally in these tables will never sync to cloud.  
**Resolution**: Updated `docs/supabase_schema.sql` and registered missing models in `SYNC_MODEL_CONFIG` & `PULL_ORDER`.

#### KB-020: Un-Transactional Multi-Step Master Entity Mutations (Partial Commit Risk)
**Severity**: High (Resolved)  
**Description**: `saveSale` (`sales.ts`) and `saveIncomingBoulder` (`purchases.ts`) execute `upsertPartyByName` and `upsertVehicleByNumber` outside `$transaction`. If the transaction rolls back, Party/Vehicle creations remain saved, creating orphan master records.  
**Resolution**: Passed `tx` into `upsertPartyByName(tx, ...)` and `upsertVehicleByNumber(tx, ...)` within the single atomic transaction.

#### KB-021: Complete Lack of Runtime Input Validation (Missing Zod Schemas)
**Severity**: High (Resolved)  
**Description**: Server Actions across `sales.ts`, `expenses.ts`, `credits.ts`, `weighbridge.ts`, `purchases.ts` accept untyped `any` or unchecked interfaces. Malformed dates, negative amounts, or invalid types reach the DB without validation.  
**Resolution**: Implement shared Zod validation schemas for all Server Action payloads and validate via `schema.parse(input)`.

#### KB-022: Weak Action Authorization & Missing Delete PIN Verification
**Severity**: High (Resolved)  
**Description**: `deleteIncomingBoulder`, `deletePartyCollection`, `deletePartyPayment`, and `resetSyncQueue` omit edit PIN verification. `verifyEditPassword` in `auth.ts` has no rate-limiting or lockout logic.  
**Resolution**: Enforced PIN verification on destructive actions and added an in-memory brute-force rate limiter (5 attempts / 10 mins).

#### KB-023: Direct Internal Exception & Schema Exposure to Client UI
**Severity**: Medium (Resolved)  
**Description**: Server actions catch errors and return `{ success: false, message: error.message }`, leaking raw SQL query text, table names, and database constraint details directly to client UI.  
**Resolution**: Created shared `sanitizeError()` utility in `src/lib/utils/sanitize-error.ts` that pattern-matches against sensitive DB/ORM terms (Prisma codes, SQL keywords, SQLite errors) and replaces them with safe fallback messages. Applied to `admin.ts`, `database.ts`, `settings.ts`, and `tally.ts`.

#### KB-024: Orphaned DayBook Expense Entries & Missing DayBook Recalculation on Expense Delete
**Severity**: Medium (Resolved)  
**Description**: `deleteExpense` in `expenses.ts` deletes `Expense` and `FinancialEvent` records but omits deleting associated `DayBookExpenseEntry` records and fails to trigger `recalculateDayBook`. Deleted expenses remain in daybook totals.  
**Resolution**: Deleted matching `DayBookExpenseEntry` by `sourceEventId` and invoked `recalculateDayBook(tx, dayBook)`.

#### KB-025: Concurrency Race Condition on Weighbridge Ticket Sequence Generation
**Severity**: Medium (Resolved)  
**Description**: `createWeighbridgeTicket` queried `_max: { ticketNumber: true }` non-atomically outside `$transaction`. Concurrent requests could read the same max sequence number and fail with Prisma unique constraint error `P2002`.  
**Resolution**: Refactored `createWeighbridgeTicket` in `src/app/actions/weighbridge.ts` to wrap `_max.ticketNumber` calculation and ticket creation in `prisma.$transaction(async (tx) => ...)` and added an optimistic retry loop (up to 5 retries) catching `P2002` collisions.

#### KB-026: Missing Database Indexes on Frequently Queried Models
**Severity**: Medium (Resolved)  
**Description**: Missing indexes on `AuditLog` (`createdAt`, `action`), `EmployeeCredit`, `OtherCredit`, `PartyLedger` (`refId`), and `WeighbridgeTicket` (`createdAt`, `vehicleId`, `partyId`), causing full table scans.  
**Resolution**: Added `@@index` annotations to `prisma/schema.prisma` and corresponding `CREATE INDEX IF NOT EXISTS` statements to `bootstrap.ts` for all identified models.

#### KB-027: N+1 Query Loop in Party Balance Aggregation (`listPartiesWithBalances`)
**Severity**: Low (Resolved)
**Description**: `listPartiesWithBalances` in `credits.ts` executes an individual `db.partyLedger.findFirst(...)` query in a JS loop per party (201 queries for 200 parties).  
**Resolution**: Fetch latest ledger balances for all parties in a single batch query using SQLite `ROW_NUMBER()`.

#### KB-028: Eternal Sync Loop & Uncaught Fatal Exceptions in Sync Engine
**Severity**: Critical (Resolved)  
**Description**: Single table fetch error (e.g. `[Sync Pull] Fetch failed for weighbridge_tickets`) or corrupt row payload caused uncaught top-level exceptions in `pushSync()` and `pullSync()`, exiting before database sync cursors (`lastSyncedAt`) could be saved. The UI polling loop (10s) continuously re-executed the identical failing operation indefinitely.  
**Resolution**: Implemented Multi-Tier Error Boundaries (Service level, Table level in `pullSync`, and Row level in `pushSync`/`pullSync`) returning structured `SyncResult` summary objects `{ pushed, pulled, skipped, errors, status }`. Failing tables and bad rows are logged and skipped so the cursor advances safely for all healthy records. Updated UI polling in `app-shell.tsx` to use adaptive exponential backoff (10s to 5 mins max) on sync errors.

---

### Category 3: React, UI & Hydration Bugs

#### KB-006: Root `<html>` Hydration Warning with `next-themes`
**Severity**: High (Resolved)  
**Description**: `src/app/layout.tsx` lacks `suppressHydrationWarning` on the `<html>` root element. When `ThemeProvider` from `next-themes` updates `class="dark"` / `class="light"`, Next.js logs client-side hydration class mismatch warnings.  
**Resolution**: Added `suppressHydrationWarning` to `<html lang="en" ... suppressHydrationWarning>` in `src/app/layout.tsx`.

#### KB-007: Client Components Importing Prisma Runtime Directly
**Severity**: High (Resolved)  
**Description**: `src/app/weighbridge/pending-tickets-table.tsx` and `weighbridge-forms.tsx` import `{ WeighbridgeTicket } from "@prisma/client"` without `import type`, pulling server-side Prisma binary runtime code into the browser JavaScript bundle.  
**Resolution**: Converted to `import type { WeighbridgeTicket } from "@prisma/client"`.

#### KB-008: Non-Deterministic Date Evaluation in `useState` Initializer
**Severity**: Medium (Resolved)  
**Description**: `src/app/tally/tally-export-dashboard.tsx` evaluates `new Date()` directly inside `useState` default parameters at SSR time, triggering text hydration mismatches across day/timezone boundaries.  
**Resolution**: Wrapped initial date calculations in client-side mounted guards.

#### KB-009: Missing Accessibility `aria-label` / Form `id` Bindings
**Severity**: Medium (Resolved)  
**Description**: 55 form input, textarea, and checkbox controls across transaction forms and settings forms lack `id` matching `<label htmlFor>` or explicit `aria-label` attributes. Icon action buttons missing accessible text labels.  
**Resolution**: Add explicit `id` / `htmlFor` bindings or `aria-label` to all interactive form controls.

#### KB-010: Mobile UI Layout Squishing & Missing Responsive Grid Breakpoints
**Severity**: High (Resolved)  
**Description**: `src/components/app-shell.tsx` uses a fixed `grid-cols-5` layout for the mobile bottom nav on viewports <375px, and components (`dashboard.tsx`, `fuel-management-page.tsx`) use `grid-cols-2` without `grid-cols-1 sm:grid-cols-2`, causing element squishing and text overflow on mobile screens.  
**Resolution**: Use mobile-first breakpoints (`grid-cols-1 sm:grid-cols-2`) and responsive flex wrappers.

---

## Older Baseline Issues

### KB-001: Windows Production Build Missing
**Severity**: High  
The only packaged build is a macOS `.dmg`. A Windows `.exe` / `nsis` installer has not been produced yet.  
**Resolution**: Run `npm run electron:package` on a Windows machine.

### KB-002: Supabase Sync Requires Manual Schema Setup
**Severity**: High  
The sync engine cannot access a new cloud project until its schema and authenticated RLS policies are installed.  
**Resolution**: Run `supabase_schema.sql` followed by `supabase_rls_policies.sql`.

### KB-003: Silent Printing Not Yet Supported
**Severity**: Low  
Printing opens the browser print dialog.  
**Resolution**: Deferred to a future patch.

### KB-004: Database Restore Requires Page Reload
**Severity**: Low  
Restoring from a backup forces `window.location.reload()`.  
**Resolution**: Working as intended.

### KB-005: `sync_state` Table Build Warning
**Severity**: Info  
Prisma logs warning during static generation if dev database is not synced.  
**Resolution**: Run `npx prisma db push`.

---

## Resolved Post-Mortems

### KB-PM-001: Electron Startup Timeout (Prisma Schema Mismatch)
**Severity**: Critical (Resolved)  
**Root Cause**: Prisma schema compiled into standalone app did not match local SQLite database.  
**Resolution**: Updated `package.json` extraResources and implemented Factory Reset fallback in `desktop/main.js`.

### KB-PM-002: ZIP Extraction Pathing Issue
**Severity**: Medium (Resolved)  
**Root Cause**: `Expand-Archive` on Windows stripped top-level directory.  
**Resolution**: Used `tar -xf` to preserve directory hierarchy.
