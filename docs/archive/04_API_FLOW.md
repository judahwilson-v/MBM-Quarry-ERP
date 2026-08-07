# 04_API_FLOW

This document outlines the API architecture, server actions, and data flow of the MBM ERP.

## Architecture Paradigm
The application heavily utilizes **Next.js Server Actions** for internal mutations (UI to Database). 
Standard REST API routes (`/api/...`) are reserved primarily for external integrations, imports/exports, and system-level operations.

## 1. Server Actions (`src/app/actions`)

### `admin.ts`
- **Mutations**:
  - `updateAdminPin(oldPin, newPin)`
  - `updateDeletePin(oldPin, newPin)`
  - `verifyAdminPin(pin)`
- **Data Flow**: Reads/Writes to `GlobalSettings` table.
- **Error Handling**: Throws custom errors if PIN mismatch occurs.

### `database.ts`
- **Mutations**:
  - `triggerBackup()`: Triggers SQLite file copy.
  - `vacuumDatabase()`: Runs `VACUUM` on SQLite to optimize storage.
- **Data Flow**: Directly manipulates the `.db` file on the filesystem via `fs`.
- **Error Handling**: Catches file IO errors and returns `{ success: false, error: string }`.

### `settings.ts`
- **Mutations**:
  - `updateGlobalSettings(data)`
- **Queries**:
  - `getGlobalSettings()`
- **Data Flow**: Upserts to `GlobalSettings` with `id: "default"`.

### `sync.ts`
- **Mutations**:
  - `triggerSync()`: Executes `pushSync()` followed by `pullSync()` from `sync-service.ts`.
- **Queries**:
  - `fetchSyncStatus()`: Returns `lastSyncedAt`, `status`, and `pendingCount`.
- **Data Flow**: Uses the signed-in server-side Supabase session; extracts `payload.after` from standard audit events; maps aliases such as `Sale` to `outgoing_sales`; and scans non-audited financial/inventory projections by timestamp. Pull uses explicit lower-camel Prisma delegate names and table-specific cursor columns.
- **Error Handling**: Stops on the first remote or local write failure, records table/row context, marks `SyncState` as `ERROR`, and does not advance past an unapplied row.

### `tally.ts`
- **Queries**:
  - `generateTallyXML(dateRange)`: Aggregates Ledgers, Sales, and DayBook into Tally ERP 9 compatible XML format.
- **Data Flow**: Reads from `LedgerEntry` and `DayBook`, transforms to XML schema.

## 2. API Routes (`src/app/api`)

### `/api/database/export` (GET)
- **Purpose**: Downloads the `local.db` SQLite file.
- **Data Flow**: Streams the binary file to the client.

### `/api/database/import` (POST)
- **Purpose**: Uploads and restores a SQLite backup.
- **Data Flow**: Receives `multipart/form-data`, overrides `local.db`, and restarts the Prisma client engine.

### `/api/auth/`
- **Purpose**: Not fully implemented. Auth is handled by PINs locally.

### `/api/v1/...`
- **Purpose**: Stubbed for future Android/mobile app ingestion (Not fully implemented yet).

## 3. Core Database Operations (Domain Logic)
Instead of putting Prisma queries in components, the app uses a Repository/Service pattern inside `src/lib/domain`.

### Example Flow: Creating a Sale
1. **Client**: Submits form to `createSale` (Server Action or Domain Service).
2. **Database Query**: `prisma.outgoingSale.create()`.
3. **Event Sourcing**: 
   - `prisma.financialEvent.create({ eventType: "SALE", payload: {...} })`
   - `prisma.ledgerEntry.create(...)`
   - `prisma.partyLedger.create(...)`
4. **Audit**: `prisma.auditLog.create(...)` for Supabase sync.
5. **Cache**: `revalidatePath("/sales")` is called to clear Next.js cache.
6. **Client**: UI updates with new data.

## 4. Error Handling Strategy
- **Prisma Errors**: Caught at the domain boundary. Unique constraint failures (e.g. duplicate vehicle number) are mapped to user-friendly messages.
- **Transactions**: All multi-table updates (e.g., Sale + Ledger + Audit) must be wrapped in `$transaction` to ensure atomic consistency. If the Ledger update fails, the Sale is rolled back.
