# Master Codebase Audit Report — MBM Quarry V2

**Target Project Directory**: `d:\mbm file\project\MBM1`  
**Working Directory**: `d:\mbm file\.agents\orchestrator`  
**Docs Directory**: `d:\mbm file\docs`  
**Audit Date**: 2026-08-05  
**Orchestration Pattern**: Divide-and-Conquer across 3 Parallel Worker Subagents  
**Constraint Verification**: Strict Read-Only Mode (0 source code files modified)

---

## 1. Executive Summary

A comprehensive multi-agent codebase audit was conducted across the entire MBM Quarry V2 project (`d:\mbm file\project\MBM1`). The objective was strictly discovery, pattern matching, and documentation of all existing defects, architectural anti-patterns, schema misalignments, type dishonesty, hydration bugs, and security risks.

The audit was partitioned into 3 parallel categories:
1. **Category 1: Type Safety & Linting Audit** (`d:\mbm file\.agents\explorer_cat1\cat1_audit_report.md`)
2. **Category 2: Schema, Database & Server Actions Audit** (`d:\mbm file\.agents\explorer_cat2\cat2_audit_report.md`)
3. **Category 3: React, UI & Hydration Audit** (`d:\mbm file\.agents\explorer_cat3\cat3_audit_report.md`)

A total of **27 distinct findings** were identified across the codebase:
- **Critical Severity**: 3 Findings (Purchases `runTx` infinite recursion crash, Missing `vehicles.engine_hours` SQLite column in DDL, Dishonest `serialize<T>(value: T): T` signature).
- **High Severity**: 8 Findings (Supabase cloud schema desync, Un-transactional master updates, Missing Zod input validations, Missing delete PIN checks, Client components importing Prisma binary directly, Missing root hydration guard, Rigid mobile navigation layout, Missing mobile responsive grid breakpoints).
- **Medium Severity**: 11 Findings (Double type casts `as unknown as T`, 267 ESLint unused variable errors, Untyped `(window as any).electron`, Unhandled null array guarding, Direct exception exposure to client, Orphaned daybook entries on expense delete, Weighbridge ticket race condition, Missing database indexes, Non-deterministic `new Date()` in `useState`, Form accessibility gaps, Fixed pixel width mobile overflow).
- **Low Severity**: 5 Findings (`type Row = any` aliases, N+1 query loop in party balances, Unused exported components, Monolithic page component files, Icon button missing `aria-label`).

---

## 2. Category Audit Breakdown

### Category 1: Type Safety & Linting Audit
- **TypeScript Check**: `npx tsc --noEmit` returned exit code 0, but clean compile was achieved through dishonest generic signatures (`serialize<T>(value: T): T`), double type casts (`as unknown as T`), and `as any` casting.
- **ESLint Check**: `npm run lint` failed with **267 errors/warnings**, primarily caused by copy-pasted unused imports in Server Action headers (`@typescript-eslint/no-unused-vars`).
- **Key Findings**:
  - `serialize<T>(value: T): T` across 11 Server Actions claims to return `Date` objects, but converts them to ISO strings at runtime.
  - 18 instances of double type casting (`as unknown as TargetType`) hide API response mismatches in UI components.
  - `type EmployeeRow = any;`, `type FuelPurchaseRow = any;`, `type VehicleRow = any;` suppress type checking on key page modules.
  - `(window as any).electron` used across 5 UI files due to missing global `window.d.ts`.

### Category 2: Schema, DB & Server Actions Audit
- **Prisma Schema Validation**: `npx prisma validate` returned exit code 0 (valid schema).
- **SQLite Bootstrap DDL**: `prisma/schema.prisma` defines `Vehicle.engineHours`, but `CREATE TABLE vehicles` and `ensureSQLiteColumn` in `src/lib/bootstrap.ts` omit `engine_hours`. Querying `engineHours` via Prisma crashes SQLite.
- **Server Actions Infinite Recursion**: `src/app/actions/purchases.ts` line 136 defines `runTx` calling itself recursively without calling `db.$transaction`, causing `RangeError: Maximum call stack size exceeded` on boulder purchases.
- **Transaction Safety**: `saveSale` and `saveIncomingBoulder` execute `upsertPartyByName` and `upsertVehicleByNumber` outside `$transaction`, risking partial commits.
- **Cloud Schema Alignment**: `weighbridge_tickets`, `maintenance_records`, `maintenance_schedules`, and `vehicle_stats` tables are missing from `SYNC_MODEL_CONFIG` and `docs/supabase_schema.sql`.
- **Validation & Auth**: All Server Actions lack Zod schema validation. `deleteIncomingBoulder`, `deletePartyCollection`, `deletePartyPayment`, and `resetSyncQueue` omit PIN checks.

### Category 3: React, UI & Hydration Audit
- **Hydration Guards**: `src/app/layout.tsx` missing `suppressHydrationWarning` on `<html>` root tag, triggering `next-themes` SSR hydration class mismatch warnings.
- **Server/Client Boundary**: `pending-tickets-table.tsx` and `weighbridge-forms.tsx` are marked `'use client'` but import `{ WeighbridgeTicket } from "@prisma/client"` without `import type`, pulling server-side Prisma binary runtime into client bundle.
- **State Initialization**: `tally-export-dashboard.tsx` evaluates `new Date()` directly in `useState` initializers at SSR time.
- **Accessibility**: 55 form input, textarea, and checkbox controls lack `id` matching `<label htmlFor>` or explicit `aria-label`. Icon action buttons lack accessible text.
- **Responsive Layout**: `app-shell.tsx` uses rigid `grid-cols-5` for mobile nav bar (<375px), and `dashboard.tsx` uses `grid-cols-2` without `grid-cols-1 sm:grid-cols-2`, causing UI squishing on mobile devices.

---

## 3. Master Findings Table

| ID | Domain | Priority | File Location | Summary | Zero-Regression Fix |
|---|---|---|---|---|---|
| **CAT2-01** | Server Actions | **Critical** | `src/app/actions/purchases.ts:136` | `runTx` infinite recursion stack overflow crash | Replace self-call with `return await db.$transaction(txFn)` |
| **CAT2-02** | Database DDL | **Critical** | `src/lib/bootstrap.ts:177, 608` | Missing SQLite column `vehicles.engine_hours` | Add `engine_hours REAL` to `CREATE TABLE vehicles` & `ensureSQLiteColumn` |
| **CAT1-01** | Type Safety | **Critical** | `src/app/actions/*.ts` (11 files) | Dishonest `serialize<T>(value: T): T` signature | Create generic `Serialized<T>` helper type in `src/lib/utils/serialize.ts` |
| **CAT2-03** | Cloud Sync | **High** | `src/lib/sync/sync-config.ts` | Cloud schema & sync config desync (4 tables missing) | Register missing tables in `SYNC_MODEL_CONFIG` & `docs/supabase_schema.sql` |
| **CAT2-04** | Transactions | **High** | `src/app/actions/sales.ts:231` | Un-transactional master entity updates | Pass `tx` into `upsertPartyByName(tx, ...)` inside `$transaction` |
| **CAT2-05** | Security | **High** | `src/app/actions/*.ts` | Complete lack of runtime input validation (missing Zod) | Create Zod schemas for all action payloads and parse before DB calls |
| **CAT2-06** | Security | **High** | `src/app/actions/purchases.ts:252` | Missing delete PIN checks on sensitive actions | Enforce edit PIN validation on all deletion/reset actions |
| **CAT3-B01** | Client Boundary | **High** | `pending-tickets-table.tsx:4` | Client component importing `@prisma/client` directly | Convert to `import type { WeighbridgeTicket } from "@prisma/client"` |
| **CAT3-H01** | Hydration | **High** | `src/app/layout.tsx:28` | Missing `suppressHydrationWarning` on `<html>` tag | Add `suppressHydrationWarning` to `<html>` root element |
| **CAT3-R01** | Layout | **High** | `src/components/app-shell.tsx:141` | Mobile bottom nav rigid `grid-cols-5` tab squishing | Use responsive flex layout or text truncation |
| **CAT3-R02** | Layout | **High** | `src/components/modules/dashboard.tsx:102` | `grid-cols-2` without mobile breakpoint | Change to `grid-cols-1 sm:grid-cols-2` |
| **CAT1-02** | Type Safety | **Medium** | `src/components/modules/*.tsx` | 18 double type casts (`as unknown as T`) | Consume typed DTO responses directly |
| **CAT1-04** | Linting | **Medium** | `src/app/actions/*.ts` | 267 ESLint unused variable/import errors | Purge unused imports and run `npx eslint --fix` |
| **CAT1-05** | Type Safety | **Medium** | `updater-overlay.tsx:34` | Untyped `(window as any).electron` & `tx: any` | Create `src/types/global.d.ts` for `window.electron` |
| **CAT1-06** | UI State | **Medium** | `day-book-page.tsx:273` | Unhandled null array guarding (`undefined === 0`) | Use nullish coalescing default: `const transfers = data?.transfers ?? [];` |
| **CAT2-07** | Error Handling | **Medium** | `admin.ts:12`, `weighbridge.ts:46` | Direct database exception message disclosure to client | Return sanitized error messages while logging raw errors internally |
| **CAT2-08** | Data Integrity | **Medium** | `expenses.ts:328` | Orphaned daybook entries on expense delete | Delete matching `DayBookExpenseEntry` and call `recalculateDayBook` |
| **CAT2-09** | Concurrency | **Medium** | `weighbridge.ts:21` | Race condition on weighbridge ticket sequence | Wrap sequence generation and ticket insert in atomic transaction |
| **CAT2-10** | Performance | **Medium** | `prisma/schema.prisma` | Missing database indexes on lookup fields | Add `@@index` annotations to Prisma schema & bootstrap DDL |
| **CAT3-H02** | Hydration | **Medium** | `tally-export-dashboard.tsx:11` | Non-deterministic `new Date()` in `useState` | Wrap initial date calculation in `useEffect` |
| **CAT3-A01** | Accessibility | **Medium** | `src/components/modules/*.tsx` | 55 form input, textarea controls missing `id`/`aria-label` | Bind inputs to `<label htmlFor>` via `id` or add `aria-label` |
| **CAT3-R03** | Layout | **Medium** | `system-diagnostics.tsx:156` | Fixed pixel widths causing mobile horizontal overflow | Replace fixed pixel widths with responsive max-width classes |
| **CAT1-03** | Type Safety | **Low** | `employees-page.tsx:12` | Explicit `type Row = any` aliases | Replace `any` aliases with strict TypeScript interfaces |
| **CAT2-11** | Performance | **Low** | `credits.ts:392` | N+1 query loop in party balance calculation | Replace JS loop with single batch query |
| **CAT3-C01** | Architecture | **Low** | `credit-pages.tsx:612` | Exported components never imported or rendered | Purge or document unused component exports |
| **CAT3-C02** | Architecture | **Low** | `credit-pages.tsx:1-872` | Monolithic 872-line component file (4 sub-pages) | Split monolithic file into dedicated sub-component modules |
| **CAT3-A02** | Accessibility | **Low** | `updater-overlay.tsx:128` | Icon action buttons missing `aria-label` | Add `aria-label` or `<span className="sr-only">` to icon buttons |

---

## 4. Documentation Updates Summary

The following documentation files have been updated with complete findings, severity assessments, root cause analyses, and zero-regression recommendations:
1. `d:\mbm file\project\MBM1\docs\KNOWN_BUGS.md` — Updated with entries KB-006 through KB-027.
2. `d:\mbm file\project\MBM1\docs\PROJECT_STATE.md` — Updated with Phase 11 (Audit Completed) status.
3. `d:\mbm file\project\MBM1\docs\CHANGELOG.md` — Updated with `v1.11.5` release entry.
4. `d:\mbm file\docs\MASTER_CODEBASE_AUDIT_REPORT.md` — Master repository-wide audit summary (this report).
5. Synced `KNOWN_BUGS.md`, `PROJECT_STATE.md`, and `CHANGELOG.md` into `d:\mbm file\docs\`.

---

## 5. Zero-Source-Code Modification Attestation

The Project Orchestrator and all 3 worker subagents executed strictly under Read-Only Mode.
- No files under `src/` were created, edited, or deleted.
- No files under `prisma/` were created, edited, or deleted.
- No source code files (`.ts`, `.tsx`, `.prisma`, `.json`, `.js`) were modified.
- All artifact and report outputs were restricted exclusively to `.agents/` and `docs/`.
