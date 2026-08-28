-- Phase 5 checkpoint 1: generic, allowlisted outbox dispatcher.
-- Entity/table mapping is static in the function; identifiers are never taken
-- from a device payload. A failed projection rolls back the inbox insertion,
-- keeping the event retryable.
ALTER TABLE public.sync_event_inbox
  DROP CONSTRAINT IF EXISTS sync_event_inbox_entity_type_check;

ALTER TABLE public.sync_event_inbox
  ADD CONSTRAINT sync_event_inbox_entity_type_check CHECK (entity_type IN (
    'Vehicle','Party','Supplier','Material','OutgoingSale','IncomingBoulder',
    'PartyCredit','PartyCollection','PartyLedger','PartyPayment','Expense',
    'EmployeeCredit','OtherCredit','DayBook','DayBookEntry','DayBookExpenseEntry',
    'Employee','EmployeeLedger','FuelPurchase','CashTransfer','GlobalSettings',
    'FinancialEvent','LedgerEntry','InventoryStock','InventoryTransaction',
    'WeighbridgeTicket','MaintenanceRecord','MaintenanceSchedule','VehicleStats'
  ));

CREATE OR REPLACE FUNCTION public.apply_outbox_event(
  p_event_id UUID,
  p_device_id UUID,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_operation TEXT,
  p_payload JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  inserted_event UUID;
  target_table TEXT;
  update_columns TEXT;
BEGIN
  IF p_operation NOT IN ('create', 'update', 'delete') THEN
    RAISE EXCEPTION 'Unsupported outbox operation: %', p_operation;
  END IF;
  IF COALESCE(p_payload->>'id', '') <> p_entity_id THEN
    RAISE EXCEPTION 'Outbox entity ID does not match payload ID';
  END IF;

  target_table := CASE p_entity_type
    WHEN 'Vehicle' THEN 'vehicles' WHEN 'Party' THEN 'parties'
    WHEN 'Supplier' THEN 'suppliers' WHEN 'Material' THEN 'materials'
    WHEN 'OutgoingSale' THEN 'outgoing_sales' WHEN 'IncomingBoulder' THEN 'incoming_boulder'
    WHEN 'PartyCredit' THEN 'party_credit' WHEN 'PartyCollection' THEN 'party_collections'
    WHEN 'PartyLedger' THEN 'party_ledger' WHEN 'PartyPayment' THEN 'party_payments'
    WHEN 'Expense' THEN 'expenses' WHEN 'EmployeeCredit' THEN 'employee_credit'
    WHEN 'OtherCredit' THEN 'other_credits' WHEN 'DayBook' THEN 'day_books'
    WHEN 'DayBookEntry' THEN 'day_book_entries' WHEN 'DayBookExpenseEntry' THEN 'day_book_expense_entries'
    WHEN 'Employee' THEN 'employees' WHEN 'EmployeeLedger' THEN 'employee_ledgers'
    WHEN 'FuelPurchase' THEN 'fuel_purchases' WHEN 'CashTransfer' THEN 'cash_transfers'
    WHEN 'GlobalSettings' THEN 'global_settings' WHEN 'FinancialEvent' THEN 'financial_events'
    WHEN 'LedgerEntry' THEN 'ledger_entries' WHEN 'InventoryStock' THEN 'inventory_stock'
    WHEN 'InventoryTransaction' THEN 'inventory_transactions' WHEN 'WeighbridgeTicket' THEN 'weighbridge_tickets'
    WHEN 'MaintenanceRecord' THEN 'maintenance_records' WHEN 'MaintenanceSchedule' THEN 'maintenance_schedules'
    WHEN 'VehicleStats' THEN 'vehicle_stats' ELSE NULL END;
  IF target_table IS NULL THEN RAISE EXCEPTION 'Unsupported outbox entity type: %', p_entity_type; END IF;

  INSERT INTO public.sync_event_inbox(event_id, device_id, entity_type, entity_id, operation, payload)
  VALUES (p_event_id, p_device_id, p_entity_type, p_entity_id, p_operation, p_payload)
  ON CONFLICT (event_id) DO NOTHING RETURNING event_id INTO inserted_event;
  IF inserted_event IS NULL THEN RETURN FALSE; END IF;

  IF p_operation = 'delete' THEN
    EXECUTE format('DELETE FROM public.%I WHERE id = $1', target_table) USING p_entity_id;
    RETURN TRUE;
  END IF;

  SELECT string_agg(format('%1$I = EXCLUDED.%1$I', column_name), ', ' ORDER BY ordinal_position)
    INTO update_columns
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = target_table AND column_name <> 'id';

  EXECUTE format(
    'INSERT INTO public.%1$I SELECT * FROM jsonb_populate_record(NULL::public.%1$I, $1) ON CONFLICT (id) DO UPDATE SET %2$s',
    target_table, update_columns
  ) USING p_payload;
  RETURN TRUE;
END;
$$;
