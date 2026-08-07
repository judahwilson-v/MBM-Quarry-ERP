-- Disable Row Level Security on all mirrored tables so the sync engine
-- can operate with the anon key without any authenticated session.
--
-- Run this script in the Supabase SQL Editor ONCE.
-- It drops the previous authenticated_sync_access policies and disables RLS.
--
-- WARNING: This allows anyone with the anon key to read/write these tables.
-- Acceptable for a private quarry ERP; never use on a public-facing app.

DO $$
DECLARE
  sync_table TEXT;
  sync_tables TEXT[] := ARRAY[
    'vehicles',
    'parties',
    'materials',
    'outgoing_sales',
    'financial_events',
    'ledger_entries',
    'day_books',
    'day_book_expense_entries',
    'incoming_boulder',
    'party_credit',
    'party_collections',
    'party_ledger',
    'party_payments',
    'employee_credit',
    'suppliers',
    'day_book_entries',
    'audit_logs',
    'roles',
    'other_credits',
    'expenses',
    'sync_state',
    'cash_transfers',
    'employees',
    'employee_ledgers',
    'fuel_purchases',
    'global_settings',
    'inventory_stock',
    'inventory_transactions'
  ];
BEGIN
  FOREACH sync_table IN ARRAY sync_tables LOOP
    -- Drop the authenticated-only policy if it exists
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = sync_table
        AND policyname = 'authenticated_sync_access'
    ) THEN
      EXECUTE format(
        'DROP POLICY authenticated_sync_access ON public.%I',
        sync_table
      );
    END IF;

    -- Disable RLS entirely so the anon key has full access
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', sync_table);
  END LOOP;
END
$$;
