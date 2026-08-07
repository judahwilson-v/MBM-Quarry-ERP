-- Allow the signed-in ERP user to synchronize all mirrored tables while
-- keeping anonymous/public access blocked.
-- Run after docs/supabase_schema.sql or docs/supabase_phase_a_sync_migration.sql.

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
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', sync_table);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = sync_table
        AND policyname = 'authenticated_sync_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY authenticated_sync_access ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        sync_table
      );
    END IF;
  END LOOP;
END
$$;
