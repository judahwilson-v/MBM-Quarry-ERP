-- ==========================================================================
-- AUTO-GENERATED from prisma/schema.prisma — DO NOT EDIT MANUALLY
-- Generated at: 2026-08-14T16:46:00.236Z
-- ==========================================================================

-- --------------------------------------------------------------------------
-- TABLES
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "vehicles" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "vehicle_number" TEXT NOT NULL UNIQUE,
  "party_id" TEXT,
  "party_name" TEXT,
  "company_body_qty" DOUBLE PRECISION,
  "extra_body_qty" DOUBLE PRECISION,
  "vehicle_type" TEXT,
  "trip_count" INTEGER DEFAULT 0 NOT NULL,
  "engine_hours" DOUBLE PRECISION,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "parties" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "party_name" TEXT NOT NULL UNIQUE,
  "phone" TEXT,
  "address" TEXT,
  "party_group" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "materials" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "material_name" TEXT NOT NULL UNIQUE,
  "rate_per_cft" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "outgoing_sales" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "sale_date" TIMESTAMPTZ NOT NULL,
  "serial_number" INTEGER UNIQUE,
  "book_number" INTEGER,
  "page_number" INTEGER,
  "vehicle_id" TEXT,
  "party_id" TEXT,
  "material_id" TEXT,
  "vehicle_number" TEXT NOT NULL,
  "party_name" TEXT NOT NULL,
  "material_name" TEXT NOT NULL,
  "rate_per_cft" DOUBLE PRECISION NOT NULL,
  "qty" DOUBLE PRECISION NOT NULL,
  "original_qty" DOUBLE PRECISION,
  "quantity_reason" TEXT,
  "trip_delta" INTEGER DEFAULT 1 NOT NULL,
  "discount_type" TEXT DEFAULT 'fixed' NOT NULL,
  "discount_value" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "gst_enabled" BOOLEAN DEFAULT false NOT NULL,
  "gst_rate" DOUBLE PRECISION DEFAULT 5 NOT NULL,
  "sgst" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "cgst" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "gst_amount" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "final_amount" DOUBLE PRECISION NOT NULL,
  "cash_paid" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "bank_paid" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "gpay_paid" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "paid_total" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "remaining_credit" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "remarks" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL,
  FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL,
  FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "financial_events" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "event_id" TEXT DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  "correlation_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "schema_version" INTEGER DEFAULT 1 NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ledger_entries" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "financial_event_id" TEXT NOT NULL UNIQUE,
  "correlation_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "entry_date" TIMESTAMPTZ NOT NULL,
  "cash_amount" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "bank_amount" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "gpay_amount" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "credit_amount" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "total_amount" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "day_books" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "business_date" TIMESTAMPTZ NOT NULL UNIQUE,
  "opening_cash_balance" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "opening_bank_balance" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "cash_sales_total" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "bank_sales_total" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "gpay_sales_total" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "expense_total" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "closing_cash_balance" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "closing_bank_balance" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "day_book_expense_entries" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "day_book_id" TEXT NOT NULL,
  "source_event_id" TEXT NOT NULL UNIQUE,
  "expense_type" TEXT NOT NULL,
  "entry_date" TIMESTAMPTZ NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  FOREIGN KEY ("day_book_id") REFERENCES "day_books"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "incoming_boulder" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "date" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "book_number" INTEGER,
  "page_number" INTEGER,
  "vehicle_id" TEXT,
  "party_id" TEXT,
  "material_id" TEXT,
  "vehicle_number" TEXT NOT NULL,
  "party_name" TEXT NOT NULL,
  "material_name" TEXT DEFAULT 'ROCK' NOT NULL,
  "qty" DOUBLE PRECISION NOT NULL,
  "remarks" TEXT,
  "time" TEXT,
  "rock_rate" DOUBLE PRECISION DEFAULT 26 NOT NULL,
  "amount" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "cash_paid" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "bank_paid" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "gpay_paid" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "paid_total" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "remaining_credit" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "settled" BOOLEAN DEFAULT false NOT NULL,
  "vehicle_rent" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "combined_payment" BOOLEAN DEFAULT false NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL,
  FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL,
  FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "party_credit" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "party_id" TEXT,
  "party_name" TEXT NOT NULL,
  "sale_id" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "status" TEXT DEFAULT 'pending' NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL,
  FOREIGN KEY ("sale_id") REFERENCES "outgoing_sales"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "party_collections" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "party_id" TEXT,
  "party_name" TEXT NOT NULL,
  "collection_date" TIMESTAMPTZ NOT NULL,
  "cash_paid" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "bank_paid" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "gpay_paid" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "total_amount" DOUBLE PRECISION NOT NULL,
  "remarks" TEXT,
  "source_event_id" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "party_ledger" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "party_id" TEXT,
  "party_name" TEXT NOT NULL,
  "date" TIMESTAMPTZ NOT NULL,
  "time" TEXT,
  "type" TEXT NOT NULL,
  "ref_id" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "payment_method" TEXT,
  "debit_amount" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "credit_amount" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "balance" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "cash_transfers" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "date" TIMESTAMPTZ NOT NULL,
  "time" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "user_name" TEXT NOT NULL,
  "remarks" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "party_payments" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "party_id" TEXT,
  "party_name" TEXT NOT NULL,
  "payment_date" TIMESTAMPTZ NOT NULL,
  "cash_paid" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "bank_paid" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "gpay_paid" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "total_amount" DOUBLE PRECISION NOT NULL,
  "remarks" TEXT,
  "source_event_id" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "employee_credit" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "employee_name" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "reason" TEXT,
  "expected_due_date" TIMESTAMPTZ,
  "status" TEXT DEFAULT 'pending' NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "supplier_name" TEXT NOT NULL UNIQUE,
  "phone" TEXT,
  "address" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "day_book_entries" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "entry_date" TIMESTAMPTZ NOT NULL,
  "entry_type" TEXT NOT NULL,
  "reference" TEXT,
  "description" TEXT,
  "debit" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "credit" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "entity_name" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "payload" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "roles" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "role_name" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "other_credits" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "name" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "reason" TEXT,
  "expected_due_date" TIMESTAMPTZ,
  "status" TEXT DEFAULT 'pending' NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "expenses" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "expense_date" TIMESTAMPTZ NOT NULL,
  "expense_type" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "payment_mode" TEXT DEFAULT 'CASH' NOT NULL,
  "party_id" TEXT,
  "party_name" TEXT,
  "vehicle_id" TEXT,
  "vehicle_number" TEXT,
  "description" TEXT,
  "source_event_id" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL,
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "employees" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "phone" TEXT,
  "address" TEXT,
  "role" TEXT DEFAULT 'STAFF' NOT NULL,
  "balance" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "employee_ledgers" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "employee_id" TEXT NOT NULL,
  "date" TIMESTAMPTZ NOT NULL,
  "type" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "balance" DOUBLE PRECISION NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "fuel_purchases" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "date" TIMESTAMPTZ NOT NULL,
  "fuel_type" TEXT DEFAULT 'DIESEL' NOT NULL,
  "price_per_litre" DOUBLE PRECISION,
  "qty_litre" DOUBLE PRECISION,
  "amount" DOUBLE PRECISION NOT NULL,
  "paid_amount" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "credit_amount" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "is_can" BOOLEAN DEFAULT false NOT NULL,
  "vehicle_id" TEXT,
  "vehicle_number" TEXT,
  "source_event_id" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "global_settings" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "quarry_name" TEXT DEFAULT 'MBM Quarry' NOT NULL,
  "gst_number" TEXT DEFAULT '' NOT NULL,
  "address" TEXT DEFAULT '' NOT NULL,
  "phone" TEXT DEFAULT '' NOT NULL,
  "default_printer" TEXT DEFAULT '' NOT NULL,
  "backup_folder" TEXT DEFAULT '' NOT NULL,
  "admin_pin" TEXT DEFAULT '8888' NOT NULL,
  "delete_pin" TEXT DEFAULT '7711' NOT NULL,
  "enable_weighbridge" BOOLEAN DEFAULT false NOT NULL,
  "enable_fleet_maintenance" BOOLEAN DEFAULT false NOT NULL,
  "enable_customer_portal" BOOLEAN DEFAULT false NOT NULL,
  "enable_credit_locks" BOOLEAN DEFAULT false NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "inventory_stock" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "material_name" TEXT NOT NULL UNIQUE,
  "quantity" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "unit" TEXT DEFAULT 'TONS' NOT NULL,
  "last_updated" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "inventory_transactions" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "stock_id" TEXT NOT NULL,
  "date" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "type" TEXT NOT NULL,
  "quantity_change" DOUBLE PRECISION NOT NULL,
  "reference_id" TEXT,
  "description" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  FOREIGN KEY ("stock_id") REFERENCES "inventory_stock"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "weighbridge_tickets" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "ticket_number" INTEGER NOT NULL UNIQUE,
  "vehicle_number" TEXT NOT NULL,
  "vehicle_id" TEXT,
  "party_id" TEXT,
  "material_id" TEXT,
  "ticket_type" TEXT DEFAULT 'OUTGOING' NOT NULL,
  "status" TEXT DEFAULT 'FIRST_WEIGHT' NOT NULL,
  "gross_weight" DOUBLE PRECISION,
  "gross_time" TIMESTAMPTZ,
  "tare_weight" DOUBLE PRECISION,
  "tare_time" TIMESTAMPTZ,
  "net_weight" DOUBLE PRECISION,
  "linked_sale_id" TEXT UNIQUE,
  "linked_boulder_id" TEXT UNIQUE,
  "remarks" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "maintenance_records" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "vehicle_id" TEXT NOT NULL,
  "date" TIMESTAMPTZ NOT NULL,
  "engine_hours" DOUBLE PRECISION NOT NULL,
  "service_type" TEXT NOT NULL,
  "description" TEXT,
  "cost" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "maintenance_schedules" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "vehicle_id" TEXT NOT NULL,
  "service_type" TEXT NOT NULL,
  "interval_hours" DOUBLE PRECISION,
  "interval_days" INTEGER,
  "next_due_hours" DOUBLE PRECISION,
  "next_due_date" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "vehicle_stats" (
  "id" TEXT DEFAULT gen_random_uuid() PRIMARY KEY,
  "vehicle_id" TEXT NOT NULL UNIQUE,
  "engine_hours" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE
);

-- --------------------------------------------------------------------------
-- INDEXES
-- --------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "idx_vehicles_party_id" ON "vehicles" ("party_id");
CREATE INDEX IF NOT EXISTS "idx_vehicles_party_name" ON "vehicles" ("party_name");
CREATE INDEX IF NOT EXISTS "idx_vehicles_updated_at" ON "vehicles" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_parties_party_name" ON "parties" ("party_name");
CREATE INDEX IF NOT EXISTS "idx_parties_updated_at" ON "parties" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_materials_material_name" ON "materials" ("material_name");
CREATE INDEX IF NOT EXISTS "idx_materials_updated_at" ON "materials" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_outgoing_sales_sale_date" ON "outgoing_sales" ("sale_date");
CREATE INDEX IF NOT EXISTS "idx_outgoing_sales_vehicle_id" ON "outgoing_sales" ("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_outgoing_sales_party_id" ON "outgoing_sales" ("party_id");
CREATE INDEX IF NOT EXISTS "idx_outgoing_sales_material_id" ON "outgoing_sales" ("material_id");
CREATE INDEX IF NOT EXISTS "idx_outgoing_sales_party_name" ON "outgoing_sales" ("party_name");
CREATE INDEX IF NOT EXISTS "idx_outgoing_sales_material_name" ON "outgoing_sales" ("material_name");
CREATE INDEX IF NOT EXISTS "idx_outgoing_sales_updated_at" ON "outgoing_sales" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_financial_events_event_id" ON "financial_events" ("event_id");
CREATE INDEX IF NOT EXISTS "idx_financial_events_correlation_id" ON "financial_events" ("correlation_id");
CREATE INDEX IF NOT EXISTS "idx_financial_events_entity_id" ON "financial_events" ("entity_id");
CREATE INDEX IF NOT EXISTS "idx_ledger_entries_financial_event_id" ON "ledger_entries" ("financial_event_id");
CREATE INDEX IF NOT EXISTS "idx_ledger_entries_correlation_id" ON "ledger_entries" ("correlation_id");
CREATE INDEX IF NOT EXISTS "idx_ledger_entries_entity_id" ON "ledger_entries" ("entity_id");
CREATE INDEX IF NOT EXISTS "idx_ledger_entries_entry_date" ON "ledger_entries" ("entry_date");
CREATE INDEX IF NOT EXISTS "idx_day_books_business_date" ON "day_books" ("business_date");
CREATE INDEX IF NOT EXISTS "idx_day_books_updated_at" ON "day_books" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_day_book_expense_entries_day_book_id" ON "day_book_expense_entries" ("day_book_id");
CREATE INDEX IF NOT EXISTS "idx_day_book_expense_entries_source_event_id" ON "day_book_expense_entries" ("source_event_id");
CREATE INDEX IF NOT EXISTS "idx_day_book_expense_entries_entry_date" ON "day_book_expense_entries" ("entry_date");
CREATE INDEX IF NOT EXISTS "idx_incoming_boulder_date" ON "incoming_boulder" ("date");
CREATE INDEX IF NOT EXISTS "idx_incoming_boulder_vehicle_id" ON "incoming_boulder" ("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_incoming_boulder_party_id" ON "incoming_boulder" ("party_id");
CREATE INDEX IF NOT EXISTS "idx_incoming_boulder_material_id" ON "incoming_boulder" ("material_id");
CREATE INDEX IF NOT EXISTS "idx_incoming_boulder_party_name" ON "incoming_boulder" ("party_name");
CREATE INDEX IF NOT EXISTS "idx_incoming_boulder_material_name" ON "incoming_boulder" ("material_name");
CREATE INDEX IF NOT EXISTS "idx_incoming_boulder_updated_at" ON "incoming_boulder" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_party_credit_party_id" ON "party_credit" ("party_id");
CREATE INDEX IF NOT EXISTS "idx_party_credit_party_name" ON "party_credit" ("party_name");
CREATE INDEX IF NOT EXISTS "idx_party_credit_sale_id" ON "party_credit" ("sale_id");
CREATE INDEX IF NOT EXISTS "idx_party_credit_status" ON "party_credit" ("status");
CREATE INDEX IF NOT EXISTS "idx_party_credit_updated_at" ON "party_credit" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_party_collections_party_id" ON "party_collections" ("party_id");
CREATE INDEX IF NOT EXISTS "idx_party_collections_party_name" ON "party_collections" ("party_name");
CREATE INDEX IF NOT EXISTS "idx_party_collections_collection_date" ON "party_collections" ("collection_date");
CREATE INDEX IF NOT EXISTS "idx_party_collections_source_event_id" ON "party_collections" ("source_event_id");
CREATE INDEX IF NOT EXISTS "idx_party_collections_updated_at" ON "party_collections" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_party_ledger_party_id" ON "party_ledger" ("party_id");
CREATE INDEX IF NOT EXISTS "idx_party_ledger_party_name" ON "party_ledger" ("party_name");
CREATE INDEX IF NOT EXISTS "idx_party_ledger_date" ON "party_ledger" ("date");
CREATE INDEX IF NOT EXISTS "idx_party_ledger_ref_id" ON "party_ledger" ("ref_id");
CREATE INDEX IF NOT EXISTS "idx_cash_transfers_date" ON "cash_transfers" ("date");
CREATE INDEX IF NOT EXISTS "idx_cash_transfers_user_name" ON "cash_transfers" ("user_name");
CREATE INDEX IF NOT EXISTS "idx_party_payments_party_id" ON "party_payments" ("party_id");
CREATE INDEX IF NOT EXISTS "idx_party_payments_party_name" ON "party_payments" ("party_name");
CREATE INDEX IF NOT EXISTS "idx_party_payments_payment_date" ON "party_payments" ("payment_date");
CREATE INDEX IF NOT EXISTS "idx_party_payments_source_event_id" ON "party_payments" ("source_event_id");
CREATE INDEX IF NOT EXISTS "idx_party_payments_updated_at" ON "party_payments" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_employee_credit_employee_name" ON "employee_credit" ("employee_name");
CREATE INDEX IF NOT EXISTS "idx_employee_credit_expected_due_date" ON "employee_credit" ("expected_due_date");
CREATE INDEX IF NOT EXISTS "idx_employee_credit_status" ON "employee_credit" ("status");
CREATE INDEX IF NOT EXISTS "idx_employee_credit_updated_at" ON "employee_credit" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_suppliers_supplier_name" ON "suppliers" ("supplier_name");
CREATE INDEX IF NOT EXISTS "idx_suppliers_updated_at" ON "suppliers" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_day_book_entries_entry_date" ON "day_book_entries" ("entry_date");
CREATE INDEX IF NOT EXISTS "idx_day_book_entries_updated_at" ON "day_book_entries" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_entity_name" ON "audit_logs" ("entity_name");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_entity_id" ON "audit_logs" ("entity_id");
CREATE INDEX IF NOT EXISTS "idx_roles_role_name" ON "roles" ("role_name");
CREATE INDEX IF NOT EXISTS "idx_roles_updated_at" ON "roles" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_other_credits_name" ON "other_credits" ("name");
CREATE INDEX IF NOT EXISTS "idx_other_credits_expected_due_date" ON "other_credits" ("expected_due_date");
CREATE INDEX IF NOT EXISTS "idx_other_credits_status" ON "other_credits" ("status");
CREATE INDEX IF NOT EXISTS "idx_other_credits_updated_at" ON "other_credits" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_expenses_expense_date" ON "expenses" ("expense_date");
CREATE INDEX IF NOT EXISTS "idx_expenses_party_id" ON "expenses" ("party_id");
CREATE INDEX IF NOT EXISTS "idx_expenses_party_name" ON "expenses" ("party_name");
CREATE INDEX IF NOT EXISTS "idx_expenses_vehicle_id" ON "expenses" ("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_expenses_source_event_id" ON "expenses" ("source_event_id");
CREATE INDEX IF NOT EXISTS "idx_expenses_updated_at" ON "expenses" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_employees_name" ON "employees" ("name");
CREATE INDEX IF NOT EXISTS "idx_employees_updated_at" ON "employees" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_employee_ledgers_employee_id" ON "employee_ledgers" ("employee_id");
CREATE INDEX IF NOT EXISTS "idx_employee_ledgers_date" ON "employee_ledgers" ("date");
CREATE INDEX IF NOT EXISTS "idx_fuel_purchases_date" ON "fuel_purchases" ("date");
CREATE INDEX IF NOT EXISTS "idx_fuel_purchases_vehicle_id" ON "fuel_purchases" ("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_fuel_purchases_source_event_id" ON "fuel_purchases" ("source_event_id");
CREATE INDEX IF NOT EXISTS "idx_fuel_purchases_updated_at" ON "fuel_purchases" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_global_settings_quarry_name" ON "global_settings" ("quarry_name");
CREATE INDEX IF NOT EXISTS "idx_global_settings_updated_at" ON "global_settings" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_inventory_stock_material_name" ON "inventory_stock" ("material_name");
CREATE INDEX IF NOT EXISTS "idx_inventory_stock_last_updated" ON "inventory_stock" ("last_updated");
CREATE INDEX IF NOT EXISTS "idx_inventory_transactions_stock_id" ON "inventory_transactions" ("stock_id");
CREATE INDEX IF NOT EXISTS "idx_inventory_transactions_date" ON "inventory_transactions" ("date");
CREATE INDEX IF NOT EXISTS "idx_inventory_transactions_reference_id" ON "inventory_transactions" ("reference_id");
CREATE INDEX IF NOT EXISTS "idx_weighbridge_tickets_vehicle_id" ON "weighbridge_tickets" ("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_weighbridge_tickets_party_id" ON "weighbridge_tickets" ("party_id");
CREATE INDEX IF NOT EXISTS "idx_weighbridge_tickets_material_id" ON "weighbridge_tickets" ("material_id");
CREATE INDEX IF NOT EXISTS "idx_weighbridge_tickets_status" ON "weighbridge_tickets" ("status");
CREATE INDEX IF NOT EXISTS "idx_weighbridge_tickets_linked_sale_id" ON "weighbridge_tickets" ("linked_sale_id");
CREATE INDEX IF NOT EXISTS "idx_weighbridge_tickets_linked_boulder_id" ON "weighbridge_tickets" ("linked_boulder_id");
CREATE INDEX IF NOT EXISTS "idx_weighbridge_tickets_updated_at" ON "weighbridge_tickets" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_maintenance_records_vehicle_id" ON "maintenance_records" ("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_maintenance_records_date" ON "maintenance_records" ("date");
CREATE INDEX IF NOT EXISTS "idx_maintenance_records_updated_at" ON "maintenance_records" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_maintenance_schedules_vehicle_id" ON "maintenance_schedules" ("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_maintenance_schedules_next_due_date" ON "maintenance_schedules" ("next_due_date");
CREATE INDEX IF NOT EXISTS "idx_maintenance_schedules_updated_at" ON "maintenance_schedules" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_vehicle_stats_vehicle_id" ON "vehicle_stats" ("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_vehicle_stats_updated_at" ON "vehicle_stats" ("updated_at");

-- --------------------------------------------------------------------------
-- TRIGGERS: auto-update updated_at
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_vehicles_updated_at
  BEFORE UPDATE ON "vehicles"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_parties_updated_at
  BEFORE UPDATE ON "parties"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_materials_updated_at
  BEFORE UPDATE ON "materials"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_outgoing_sales_updated_at
  BEFORE UPDATE ON "outgoing_sales"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_day_books_updated_at
  BEFORE UPDATE ON "day_books"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_incoming_boulder_updated_at
  BEFORE UPDATE ON "incoming_boulder"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_party_credit_updated_at
  BEFORE UPDATE ON "party_credit"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_party_collections_updated_at
  BEFORE UPDATE ON "party_collections"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_party_payments_updated_at
  BEFORE UPDATE ON "party_payments"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employee_credit_updated_at
  BEFORE UPDATE ON "employee_credit"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON "suppliers"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_day_book_entries_updated_at
  BEFORE UPDATE ON "day_book_entries"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON "roles"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_other_credits_updated_at
  BEFORE UPDATE ON "other_credits"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON "expenses"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON "employees"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fuel_purchases_updated_at
  BEFORE UPDATE ON "fuel_purchases"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_global_settings_updated_at
  BEFORE UPDATE ON "global_settings"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_stock_updated_at
  BEFORE UPDATE ON "inventory_stock"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_weighbridge_tickets_updated_at
  BEFORE UPDATE ON "weighbridge_tickets"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_maintenance_records_updated_at
  BEFORE UPDATE ON "maintenance_records"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_maintenance_schedules_updated_at
  BEFORE UPDATE ON "maintenance_schedules"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vehicle_stats_updated_at
  BEFORE UPDATE ON "vehicle_stats"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
