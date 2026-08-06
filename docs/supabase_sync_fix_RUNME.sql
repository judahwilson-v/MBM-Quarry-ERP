-- ============================================================
-- SUPABASE SYNC FIX — Phase 2 & 3 Combined
-- Run this ONCE in the Supabase SQL Editor.
-- Fixes: permission denied for anon role + missing columns
-- ============================================================

DO $$
DECLARE
  t TEXT;
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
    'inventory_transactions',
    'weighbridge_tickets',
    'maintenance_records',
    'maintenance_schedules',
    'vehicle_stats'
  ];
BEGIN
  FOREACH t IN ARRAY sync_tables LOOP
    -- 1. Disable RLS so anon key has unrestricted access
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);

    -- 2. Drop the old authenticated-only policy if it exists
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = 'authenticated_sync_access'
    ) THEN
      EXECUTE format('DROP POLICY authenticated_sync_access ON public.%I', t);
    END IF;

    -- 3. Grant full CRUD to the anon role (required by PostgREST REST API)
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END
$$;

-- 4. Grant schema usage so anon can see the tables at all
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- 5. Add missing columns to global_settings, vehicles, and parties if not already present
ALTER TABLE "global_settings"
  ADD COLUMN IF NOT EXISTS "admin_pin"  TEXT NOT NULL DEFAULT '8888',
  ADD COLUMN IF NOT EXISTS "delete_pin" TEXT NOT NULL DEFAULT '7711';

ALTER TABLE "vehicles"
  ADD COLUMN IF NOT EXISTS "vehicle_type" TEXT,
  ADD COLUMN IF NOT EXISTS "engine_hours" DOUBLE PRECISION;

ALTER TABLE "parties"
  ADD COLUMN IF NOT EXISTS "party_group" TEXT;

-- Done. Verify with: SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
