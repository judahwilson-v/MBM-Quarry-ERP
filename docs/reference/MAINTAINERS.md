# MBM Quarry ERP - Maintainers Guide

This document is the absolute source of truth for understanding, modifying, and safely deploying the MBM Quarry ERP application. Any developer (human or AI) touching this codebase must read and adhere to these guidelines to prevent data corruption and production regressions.

## 1. Overall Architecture
MBM Quarry ERP is an **offline-first desktop application**.
- **Frontend Framework**: Next.js (React)
- **Desktop Shell**: Electron
- **Local Database**: SQLite (via Prisma ORM)
- **Cloud Sync**: Supabase (PostgreSQL)

The application prioritizes local functionality. It writes immediately to the local SQLite database to ensure the quarry operates without an internet connection, and asynchronously synchronizes data with Supabase when online.

## 2. Data Flow
The application utilizes a **CQRS (Command Query Responsibility Segregation) / Event-Driven Architecture** for financial transactions:
1. **User Action**: The user submits a form (e.g., records a Sale).
2. **Command / Offline Action**: `src/lib/offline-actions.ts` handles the creation of the primary entity (e.g., `OutgoingSale`).
3. **Event Emission**: The action emits a `FinancialEvent` detailing the financial impact of the transaction.
4. **Synchronous Projection**: The event emitter immediately invokes projectors (`projectLedgerFromFinancialEvent` and `recalculateDayBook`) to update derived materialized views (`LedgerEntry`, `PartyLedger`, `DayBook`).
5. **Background Sync**: A background process synchronizes all mutations (including the derived projections) to Supabase.

## 3. The Three Sources of Truth Rule
Because this is an offline-first app that syncs to a cloud backend, **the database schema exists in three places that must ALWAYS be perfectly synchronized**.
Whenever you add or modify a table/field, you must update:
1. **Prisma Schema (`prisma/schema.prisma`)**: Used for TypeScript generation and local querying.
2. **SQLite Raw Initialization (`src/lib/prisma.ts`)**: Used to create tables on the local user's machine on fresh install if Prisma's automated `db push` fails or is skipped.
3. **Supabase Schema**: The cloud PostgreSQL database must mirror the local schema exactly.

## 4. Subsystems
### 4.1 Prisma Workflow
- We use Prisma heavily to type-check interactions with SQLite.
- Because Electron packaging often obfuscates Prisma's engine location, we use custom scripts (`scripts/copy-prisma-engine.js`) to bundle the binaries.
- Do not use `prisma migrate dev` for the SQLite file. We rely on Prisma Client generation, and the SQLite tables are built manually via raw SQL (or `prisma db push`) at runtime.

### 4.2 Supabase Sync Flow
- Managed in `src/lib/sync/sync-service.ts` or related sync utilities.
- It is a one-way (Local -> Cloud) or two-way sync depending on the entity.
- The sync engine depends on `updatedAt` timestamps to resolve conflicts.
- **NEVER** build a feature that writes only to Supabase. The local SQLite database is the primary source of truth.

### 4.3 Financial Event Pipeline
- Located in `src/lib/domain/financial-events`.
- Acts as the central nervous system. 
- All financial changes (Sales, Purchases, Collections, Payments, Expenses) MUST emit a `FinancialEvent`.
- Do not manually manipulate balances. Emit an event and let the projectors handle the math.

### 4.4 Ledger Pipeline
- Located in `src/lib/domain/ledger`.
- Listens to `FinancialEvent` emissions.
- Converts events into `LedgerEntry` rows.
- Re-calculates `PartyLedger` balances automatically based on historical credits/debits.

### 4.5 DayBook Pipeline
- Located in `src/lib/domain/daybook`.
- Summarizes daily financial activity (Opening Balance, Cash Sales, Expenses, Closing Balance).
- It recalculates synchronously whenever a `FinancialEvent` fires for that specific `businessDate`.

### 4.6 Inventory Pipeline
- Evaluates stock based on `InventoryTransaction` records (`SALE_OUT`, `BOULDER_IN`, etc.).
- When creating a sale or a boulder, the logic in `offline-actions.ts` invokes inventory adjustment functions to increment or decrement the live `InventoryStock` summary.

## 5. Standard Operating Procedures

### Required Steps Whenever Adding a New Database Field
1. Update `prisma/schema.prisma`.
2. Update the raw `CREATE TABLE` script inside `src/lib/prisma.ts` to ensure fresh installs receive the column.
3. Add the column to Supabase (via SQL script or Supabase dashboard).
4. Update `src/lib/sync/sync-service.ts` if the column requires special sync handling.
5. Update TypeScript types and UI forms.
6. Run `npm run build` to verify Prisma generated types properly.

### Required Steps Whenever Adding a New Feature
1. **Plan & Impact Analysis**: Identify all affected tables and projections.
2. **Offline-First**: Implement the feature in `offline-actions.ts` hitting the local SQLite DB.
3. **Event Compliance**: If the feature affects money, emit a `FinancialEvent`. If it affects stock, create an `InventoryTransaction`.
4. **Cascade Deletes**: Ensure that deleting the new entity cascades down and cleans up any related `FinancialEvents` and `LedgerEntry` rows.
5. **UI Integration**: Build the React components.
6. **Testing**: Add assertions for your new entity into `scripts/stress-test.ts`.

## 6. Common Pitfalls (Learn From the Past)
- **Silent SQLite Failures**: A previous bug occurred where Prisma failed to find tables on production load because the Electron packaging didn't execute `prisma migrate`. **Fix**: The app now manually executes `CREATE TABLE IF NOT EXISTS` via raw SQL on startup.
- **Stale Daybook Caches**: Initially, Daybooks were re-calculated asynchronously causing the UI to show outdated totals. **Fix**: Emitter now synchronously triggers `recalculateDayBook` ensuring the `DayBook` is mathematically perfect before the API returns.
- **Orphaned Financial Events**: If you delete a Sale or a Payment but forget to cascade-delete the `FinancialEvent`, the system will crash during ledger recalculations. **Fix**: ALWAYS manually instrument `tx.financialEvent.deleteMany({ where: { entityId: id } })` when deleting root documents.
- **Dangling Promise Bugs**: Never use fire-and-forget promises for database operations. Always `await` your Prisma transactions.

## 7. Safe Development Checklist
Before committing any new feature, verify:
- [ ] Prisma schema, SQLite init logic, and Supabase are perfectly aligned.
- [ ] `npm run build` executes successfully (0 type errors).
- [ ] No `FinancialEvent` or `LedgerEntry` is orphaned when deleting an entity.
- [ ] Daybook and Dashboard totals dynamically reflect the changes mathematically.
- [ ] `npm run stress` (if available) passes 100% of its iterations without data corruption.

## 8. Production Release Checklist
- [ ] Run `npm run build`.
- [ ] Run `npm run electron:build-win` to ensure Electron successfully packages the app without pathing issues.
- [ ] Verify the packaged `.exe` correctly initializes a fresh `quarry.db` in `%APPDATA%` on a completely clean machine.
- [ ] Verify that navigating to the Dashboard does not throw a 500 error on first launch.
- [ ] Tag the git release.
