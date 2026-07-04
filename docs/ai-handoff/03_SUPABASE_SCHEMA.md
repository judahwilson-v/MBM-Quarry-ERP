# 03_SUPABASE_SCHEMA

This document details the Supabase cloud infrastructure that acts as the central sync hub for the offline-first SQLite databases running on the local ERP instances.

## Architecture Context
The MBM ERP uses an **Offline-First** architecture. 
- The local Next.js/Electron instance uses SQLite (`prisma/local.db`) as the source of truth.
- A background process (`src/lib/sync/sync-service.ts`) parses the local `AuditLog` table and pushes changes to Supabase.
- The Supabase schema is an exact 1:1 mirror of the Prisma SQLite schema, with tables mapped to `snake_case`.

## 1. Supabase Tables
The following tables exist in the `public` schema on Supabase:
- `vehicles`
- `parties`
- `materials`
- `outgoing_sales`
- `incoming_boulder`
- `party_credit`
- `party_collections`
- `party_ledger`
- `party_payments`
- `expenses`
- `employee_credit`
- `other_credits`
- `day_books`
- `day_book_entries`
- `day_book_expense_entries`
- `employees`
- `employee_ledgers`
- `fuel_purchases`
- `cash_transfers`
- `global_settings`

## 2. Views
- **Not implemented**. 
  (Read operations and aggregations are handled locally in SQLite via Prisma. Supabase is strictly for backup and cross-device sync.)

## 3. Functions
- **Not implemented**.

## 4. Triggers
- **Not implemented**. 
  (Event sourcing logic, such as updating ledgers when a sale occurs, is handled by the local Next.js backend, not Supabase triggers).

## 5. Storage Buckets
- **Not implemented**.
  (The ERP does not currently upload images, PDFs, or files to Supabase).

## 6. RLS (Row Level Security) Policies
- The database enforces RLS on all tables.
- **Service Role Bypass**: The Next.js backend uses the Supabase Service Role Key (`SUPABASE_SERVICE_ROLE_KEY`) to perform upserts during sync, which bypasses RLS.
- **Client Access**: Client-side (browser) access is strictly disabled. No `anon` key queries are allowed.

## 7. Auth Configuration
- **Not implemented**.
  (Authentication is managed locally via PINs in `GlobalSettings`, not Supabase Auth).

## 8. Realtime Subscriptions
- **Not implemented**.
  (The sync service currently uses a polling/push-based mechanism triggered manually or on intervals, not Postgres Realtime WebSockets).
