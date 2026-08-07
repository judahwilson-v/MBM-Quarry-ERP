-- ============================================================
-- SUPABASE SYNC FIX — Phase 2, 3, & 4 Combined
-- Run this ONCE in the Supabase SQL Editor.
-- Fixes: Creates missing tables and grants access permissions.
-- ============================================================

-- 1. Create missing weighbridge_tickets table
CREATE TABLE IF NOT EXISTS public.weighbridge_tickets (
    id TEXT PRIMARY KEY,
    ticket_number INTEGER UNIQUE NOT NULL,
    vehicle_number TEXT NOT NULL,
    vehicle_id TEXT,
    party_id TEXT,
    material_id TEXT,
    ticket_type TEXT DEFAULT 'OUTGOING',
    status TEXT DEFAULT 'FIRST_WEIGHT',
    gross_weight DOUBLE PRECISION,
    gross_time TIMESTAMP WITH TIME ZONE,
    tare_weight DOUBLE PRECISION,
    tare_time TIMESTAMP WITH TIME ZONE,
    net_weight DOUBLE PRECISION,
    linked_sale_id TEXT UNIQUE,
    linked_boulder_id TEXT UNIQUE,
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create missing maintenance_records table
CREATE TABLE IF NOT EXISTS public.maintenance_records (
    id TEXT PRIMARY KEY,
    vehicle_id TEXT NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    engine_hours DOUBLE PRECISION NOT NULL,
    service_type TEXT NOT NULL,
    description TEXT,
    cost DOUBLE PRECISION DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create missing maintenance_schedules table
CREATE TABLE IF NOT EXISTS public.maintenance_schedules (
    id TEXT PRIMARY KEY,
    vehicle_id TEXT NOT NULL,
    service_type TEXT NOT NULL,
    interval_hours DOUBLE PRECISION,
    interval_days INTEGER,
    next_due_hours DOUBLE PRECISION,
    next_due_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create missing vehicle_stats table
CREATE TABLE IF NOT EXISTS public.vehicle_stats (
    id TEXT PRIMARY KEY,
    vehicle_id TEXT UNIQUE NOT NULL,
    engine_hours DOUBLE PRECISION DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


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
    -- 5. Disable RLS so anon key has unrestricted access
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);

    -- 6. Drop the old authenticated-only policy if it exists
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = 'authenticated_sync_access'
    ) THEN
      EXECUTE format('DROP POLICY authenticated_sync_access ON public.%I', t);
    END IF;

    -- 7. Grant full CRUD to the anon role (required by PostgREST REST API)
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END
$$;

-- 8. Grant schema usage so anon can see the tables at all
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- 9. Add missing columns to global_settings, vehicles, and parties if not already present
ALTER TABLE public.global_settings
  ADD COLUMN IF NOT EXISTS admin_pin  TEXT NOT NULL DEFAULT '8888',
  ADD COLUMN IF NOT EXISTS delete_pin TEXT NOT NULL DEFAULT '7711';

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT,
  ADD COLUMN IF NOT EXISTS engine_hours DOUBLE PRECISION;

ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS party_group TEXT;

-- 10. Force PostgREST cache to reload so it recognizes the newly created tables immediately
NOTIFY pgrst, 'reload schema';
