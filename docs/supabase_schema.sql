-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "vehicle_number" TEXT NOT NULL,
    "party_id" TEXT,
    "party_name" TEXT,
    "company_body_qty" DOUBLE PRECISION,
    "extra_body_qty" DOUBLE PRECISION,
    "trip_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parties" (
    "id" TEXT NOT NULL,
    "party_name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "material_name" TEXT NOT NULL,
    "rate_per_cft" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outgoing_sales" (
    "id" TEXT NOT NULL,
    "sale_date" TIMESTAMP(3) NOT NULL,
    "serial_number" INTEGER,
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
    "trip_delta" INTEGER NOT NULL DEFAULT 1,
    "discount_type" TEXT NOT NULL DEFAULT 'fixed',
    "discount_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL,
    "gst_enabled" BOOLEAN NOT NULL DEFAULT false,
    "gst_rate" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "sgst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cgst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gst_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "final_amount" DOUBLE PRECISION NOT NULL,
    "cash_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bank_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gpay_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paid_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remaining_credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outgoing_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "financial_event_id" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "cash_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bank_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gpay_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_books" (
    "id" TEXT NOT NULL,
    "business_date" TIMESTAMP(3) NOT NULL,
    "opening_cash_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "opening_bank_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cash_sales_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bank_sales_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gpay_sales_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expense_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closing_cash_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closing_bank_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "day_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_book_expense_entries" (
    "id" TEXT NOT NULL,
    "day_book_id" TEXT NOT NULL,
    "source_event_id" TEXT NOT NULL,
    "expense_type" TEXT NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "day_book_expense_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incoming_boulder" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "book_number" INTEGER,
    "page_number" INTEGER,
    "vehicle_id" TEXT,
    "party_id" TEXT,
    "material_id" TEXT,
    "vehicle_number" TEXT NOT NULL,
    "party_name" TEXT NOT NULL,
    "material_name" TEXT NOT NULL DEFAULT 'ROCK',
    "qty" DOUBLE PRECISION NOT NULL,
    "remarks" TEXT,
    "time" TEXT,
    "rock_rate" DOUBLE PRECISION NOT NULL DEFAULT 26,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cash_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bank_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gpay_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paid_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remaining_credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "vehicle_rent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "combined_payment" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incoming_boulder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_credit" (
    "id" TEXT NOT NULL,
    "party_id" TEXT,
    "party_name" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "party_credit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_collections" (
    "id" TEXT NOT NULL,
    "party_id" TEXT,
    "party_name" TEXT NOT NULL,
    "collection_date" TIMESTAMP(3) NOT NULL,
    "cash_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bank_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gpay_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "remarks" TEXT,
    "source_event_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "party_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_ledger" (
    "id" TEXT NOT NULL,
    "party_id" TEXT,
    "party_name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT,
    "type" TEXT NOT NULL,
    "ref_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "payment_method" TEXT,
    "debit_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "party_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transfers" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "user_name" TEXT NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_payments" (
    "id" TEXT NOT NULL,
    "party_id" TEXT,
    "party_name" TEXT NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "cash_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bank_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gpay_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "remarks" TEXT,
    "source_event_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "party_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_credit" (
    "id" TEXT NOT NULL,
    "employee_name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "expected_due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_credit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_book_entries" (
    "id" TEXT NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "entry_type" TEXT NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "day_book_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "other_credits" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "expected_due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "other_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "expense_date" TIMESTAMP(3) NOT NULL,
    "expense_type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "payment_mode" TEXT NOT NULL DEFAULT 'CASH',
    "party_id" TEXT,
    "party_name" TEXT,
    "vehicle_id" TEXT,
    "vehicle_number" TEXT,
    "description" TEXT,
    "source_event_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_ledgers" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_purchases" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "fuel_type" TEXT NOT NULL DEFAULT 'DIESEL',
    "price_per_litre" DOUBLE PRECISION,
    "qty_litre" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION NOT NULL,
    "paid_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_can" BOOLEAN NOT NULL DEFAULT false,
    "vehicle_id" TEXT,
    "vehicle_number" TEXT,
    "source_event_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_state" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00',
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "last_error" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "quarry_name" TEXT NOT NULL DEFAULT 'MBM Quarry',
    "gst_number" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "default_printer" TEXT NOT NULL DEFAULT '',
    "backup_folder" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vehicle_number_key" ON "vehicles"("vehicle_number");

-- CreateIndex
CREATE INDEX "vehicles_party_id_idx" ON "vehicles"("party_id");

-- CreateIndex
CREATE UNIQUE INDEX "parties_party_name_key" ON "parties"("party_name");

-- CreateIndex
CREATE UNIQUE INDEX "materials_material_name_key" ON "materials"("material_name");

-- CreateIndex
CREATE UNIQUE INDEX "outgoing_sales_serial_number_key" ON "outgoing_sales"("serial_number");

-- CreateIndex
CREATE INDEX "outgoing_sales_sale_date_idx" ON "outgoing_sales"("sale_date");

-- CreateIndex
CREATE INDEX "outgoing_sales_vehicle_id_idx" ON "outgoing_sales"("vehicle_id");

-- CreateIndex
CREATE INDEX "outgoing_sales_party_id_idx" ON "outgoing_sales"("party_id");

-- CreateIndex
CREATE INDEX "outgoing_sales_material_id_idx" ON "outgoing_sales"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_events_event_id_key" ON "financial_events"("event_id");

-- CreateIndex
CREATE INDEX "financial_events_correlation_id_idx" ON "financial_events"("correlation_id");

-- CreateIndex
CREATE INDEX "financial_events_entity_type_entity_id_idx" ON "financial_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "financial_events_event_type_idx" ON "financial_events"("event_type");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_financial_event_id_key" ON "ledger_entries"("financial_event_id");

-- CreateIndex
CREATE INDEX "ledger_entries_correlation_id_idx" ON "ledger_entries"("correlation_id");

-- CreateIndex
CREATE INDEX "ledger_entries_entity_type_entity_id_idx" ON "ledger_entries"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "ledger_entries_event_type_idx" ON "ledger_entries"("event_type");

-- CreateIndex
CREATE UNIQUE INDEX "day_books_business_date_key" ON "day_books"("business_date");

-- CreateIndex
CREATE INDEX "day_books_business_date_idx" ON "day_books"("business_date");

-- CreateIndex
CREATE UNIQUE INDEX "day_book_expense_entries_source_event_id_key" ON "day_book_expense_entries"("source_event_id");

-- CreateIndex
CREATE INDEX "day_book_expense_entries_day_book_id_idx" ON "day_book_expense_entries"("day_book_id");

-- CreateIndex
CREATE INDEX "day_book_expense_entries_entry_date_idx" ON "day_book_expense_entries"("entry_date");

-- CreateIndex
CREATE INDEX "incoming_boulder_date_idx" ON "incoming_boulder"("date");

-- CreateIndex
CREATE INDEX "incoming_boulder_vehicle_id_idx" ON "incoming_boulder"("vehicle_id");

-- CreateIndex
CREATE INDEX "incoming_boulder_party_id_idx" ON "incoming_boulder"("party_id");

-- CreateIndex
CREATE INDEX "incoming_boulder_material_id_idx" ON "incoming_boulder"("material_id");

-- CreateIndex
CREATE INDEX "party_credit_party_id_idx" ON "party_credit"("party_id");

-- CreateIndex
CREATE INDEX "party_credit_party_name_idx" ON "party_credit"("party_name");

-- CreateIndex
CREATE INDEX "party_credit_sale_id_idx" ON "party_credit"("sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "party_collections_source_event_id_key" ON "party_collections"("source_event_id");

-- CreateIndex
CREATE INDEX "party_collections_party_id_idx" ON "party_collections"("party_id");

-- CreateIndex
CREATE INDEX "party_collections_party_name_idx" ON "party_collections"("party_name");

-- CreateIndex
CREATE INDEX "party_collections_collection_date_idx" ON "party_collections"("collection_date");

-- CreateIndex
CREATE INDEX "party_ledger_party_id_idx" ON "party_ledger"("party_id");

-- CreateIndex
CREATE INDEX "party_ledger_party_name_idx" ON "party_ledger"("party_name");

-- CreateIndex
CREATE INDEX "party_ledger_date_idx" ON "party_ledger"("date");

-- CreateIndex
CREATE INDEX "cash_transfers_date_idx" ON "cash_transfers"("date");

-- CreateIndex
CREATE UNIQUE INDEX "party_payments_source_event_id_key" ON "party_payments"("source_event_id");

-- CreateIndex
CREATE INDEX "party_payments_party_id_idx" ON "party_payments"("party_id");

-- CreateIndex
CREATE INDEX "party_payments_party_name_idx" ON "party_payments"("party_name");

-- CreateIndex
CREATE INDEX "party_payments_payment_date_idx" ON "party_payments"("payment_date");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_supplier_name_key" ON "suppliers"("supplier_name");

-- CreateIndex
CREATE INDEX "day_book_entries_entry_date_idx" ON "day_book_entries"("entry_date");

-- CreateIndex
CREATE INDEX "audit_logs_entity_name_entity_id_idx" ON "audit_logs"("entity_name", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_role_name_key" ON "roles"("role_name");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_source_event_id_key" ON "expenses"("source_event_id");

-- CreateIndex
CREATE INDEX "expenses_expense_date_idx" ON "expenses"("expense_date");

-- CreateIndex
CREATE INDEX "expenses_party_id_idx" ON "expenses"("party_id");

-- CreateIndex
CREATE INDEX "expenses_vehicle_id_idx" ON "expenses"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_name_key" ON "employees"("name");

-- CreateIndex
CREATE INDEX "employee_ledgers_employee_id_idx" ON "employee_ledgers"("employee_id");

-- CreateIndex
CREATE INDEX "employee_ledgers_date_idx" ON "employee_ledgers"("date");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_purchases_source_event_id_key" ON "fuel_purchases"("source_event_id");

-- CreateIndex
CREATE INDEX "fuel_purchases_date_idx" ON "fuel_purchases"("date");

-- CreateIndex
CREATE INDEX "fuel_purchases_vehicle_id_idx" ON "fuel_purchases"("vehicle_id");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outgoing_sales" ADD CONSTRAINT "outgoing_sales_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outgoing_sales" ADD CONSTRAINT "outgoing_sales_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outgoing_sales" ADD CONSTRAINT "outgoing_sales_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_book_expense_entries" ADD CONSTRAINT "day_book_expense_entries_day_book_id_fkey" FOREIGN KEY ("day_book_id") REFERENCES "day_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_boulder" ADD CONSTRAINT "incoming_boulder_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_boulder" ADD CONSTRAINT "incoming_boulder_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_boulder" ADD CONSTRAINT "incoming_boulder_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_credit" ADD CONSTRAINT "party_credit_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_credit" ADD CONSTRAINT "party_credit_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "outgoing_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_collections" ADD CONSTRAINT "party_collections_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_ledger" ADD CONSTRAINT "party_ledger_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_payments" ADD CONSTRAINT "party_payments_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_ledgers" ADD CONSTRAINT "employee_ledgers_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_purchases" ADD CONSTRAINT "fuel_purchases_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

