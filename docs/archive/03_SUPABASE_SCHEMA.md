# 03_SUPABASE_SCHEMA

This document details the Supabase cloud infrastructure that acts as the central sync hub for the offline-first SQLite databases running on the local ERP instances.

## Architecture Context
The MBM ERP uses an **Offline-First** architecture. 
- The local Next.js/Electron instance uses SQLite (`prisma/local.db`) as the source of truth.
- A background process (`src/lib/sync/sync-service.ts`) parses the local `AuditLog` table and pushes changes to Supabase.
- Projection tables without their own audit rows (`financial_events`, `ledger_entries`, `inventory_stock`, and `inventory_transactions`) are scanned by their timestamp columns during push sync.
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
- `financial_events`
- `ledger_entries`
- `inventory_stock`
- `inventory_transactions`
- `audit_logs`

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
- The database enforces RLS on all mirrored tables.
- `docs/supabase_rls_policies.sql` grants full sync access only to the `authenticated` role.
- The sync action creates a server-side Supabase client from the signed-in user's cookie session. It does not embed a service-role key or grant anonymous database access.
- Login requests still use the public anon key, as required by Supabase Auth; database policies do not grant the `anon` role table access.

## 7. Auth Configuration
- **Not implemented**.
  Supabase Auth protects the application session. Administrative and delete confirmations additionally use PINs stored in `GlobalSettings`.

## 8. Realtime Subscriptions
- **Not implemented**.
  (The sync service currently uses a polling/push-based mechanism triggered manually or on intervals, not Postgres Realtime WebSockets).
