-- Add normalized columns to existing tables without dropping legacy text fields.
ALTER TABLE "vehicles" ADD COLUMN "party_id" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "trip_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "vehicles" ADD COLUMN "updated_at" DATETIME;

ALTER TABLE "parties" ADD COLUMN "updated_at" DATETIME;

ALTER TABLE "outgoing_sales" ADD COLUMN "vehicle_id" TEXT;
ALTER TABLE "outgoing_sales" ADD COLUMN "party_id" TEXT;
ALTER TABLE "outgoing_sales" ADD COLUMN "material_id" TEXT;
ALTER TABLE "outgoing_sales" ADD COLUMN "original_qty" REAL;
ALTER TABLE "outgoing_sales" ADD COLUMN "quantity_reason" TEXT;
ALTER TABLE "outgoing_sales" ADD COLUMN "trip_delta" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "outgoing_sales" ADD COLUMN "gpay_paid" REAL NOT NULL DEFAULT 0;
ALTER TABLE "outgoing_sales" ADD COLUMN "paid_total" REAL NOT NULL DEFAULT 0;
ALTER TABLE "outgoing_sales" ADD COLUMN "remaining_credit" REAL NOT NULL DEFAULT 0;
ALTER TABLE "outgoing_sales" ADD COLUMN "updated_at" DATETIME;

ALTER TABLE "incoming_boulder" ADD COLUMN "vehicle_id" TEXT;
ALTER TABLE "incoming_boulder" ADD COLUMN "party_id" TEXT;
ALTER TABLE "incoming_boulder" ADD COLUMN "material_id" TEXT;
ALTER TABLE "incoming_boulder" ADD COLUMN "updated_at" DATETIME;

ALTER TABLE "party_credit" ADD COLUMN "party_id" TEXT;
ALTER TABLE "party_credit" ADD COLUMN "updated_at" DATETIME;

ALTER TABLE "employee_credit" ADD COLUMN "updated_at" DATETIME;

CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "supplier_name" TEXT NOT NULL,
  "phone" TEXT,
  "address" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_supplier_name_key" ON "suppliers"("supplier_name");

CREATE TABLE IF NOT EXISTS "day_book_entries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entry_date" DATETIME NOT NULL,
  "entry_type" TEXT NOT NULL,
  "reference" TEXT,
  "description" TEXT,
  "debit" REAL NOT NULL DEFAULT 0,
  "credit" REAL NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "day_book_entries_entry_date_idx" ON "day_book_entries"("entry_date");

CREATE TABLE IF NOT EXISTS "financial_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "event_id" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "payload" JSON NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "financial_events_event_id_key" ON "financial_events"("event_id");
CREATE INDEX IF NOT EXISTS "financial_events_correlation_id_idx" ON "financial_events"("correlation_id");
CREATE INDEX IF NOT EXISTS "financial_events_entity_type_entity_id_idx" ON "financial_events"("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "financial_events_event_type_idx" ON "financial_events"("event_type");

CREATE TABLE IF NOT EXISTS "ledger_entries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "financial_event_id" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "entry_date" DATETIME NOT NULL,
  "cash_amount" REAL NOT NULL DEFAULT 0,
  "bank_amount" REAL NOT NULL DEFAULT 0,
  "gpay_amount" REAL NOT NULL DEFAULT 0,
  "credit_amount" REAL NOT NULL DEFAULT 0,
  "total_amount" REAL NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_entries_financial_event_id_key" ON "ledger_entries"("financial_event_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_correlation_id_idx" ON "ledger_entries"("correlation_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_entity_type_entity_id_idx" ON "ledger_entries"("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_event_type_idx" ON "ledger_entries"("event_type");

CREATE TABLE IF NOT EXISTS "day_books" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_date" DATETIME NOT NULL,
  "opening_cash_balance" REAL NOT NULL DEFAULT 0,
  "opening_bank_balance" REAL NOT NULL DEFAULT 0,
  "cash_sales_total" REAL NOT NULL DEFAULT 0,
  "bank_sales_total" REAL NOT NULL DEFAULT 0,
  "gpay_sales_total" REAL NOT NULL DEFAULT 0,
  "expense_total" REAL NOT NULL DEFAULT 0,
  "closing_cash_balance" REAL NOT NULL DEFAULT 0,
  "closing_bank_balance" REAL NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "day_books_business_date_key" ON "day_books"("business_date");
CREATE INDEX IF NOT EXISTS "day_books_business_date_idx" ON "day_books"("business_date");

CREATE TABLE IF NOT EXISTS "day_book_expense_entries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "day_book_id" TEXT NOT NULL,
  "source_event_id" TEXT NOT NULL,
  "expense_type" TEXT NOT NULL,
  "entry_date" DATETIME NOT NULL,
  "amount" REAL NOT NULL,
  "description" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "day_book_expense_entries_source_event_id_key" ON "day_book_expense_entries"("source_event_id");
CREATE INDEX IF NOT EXISTS "day_book_expense_entries_day_book_id_idx" ON "day_book_expense_entries"("day_book_id");
CREATE INDEX IF NOT EXISTS "day_book_expense_entries_entry_date_idx" ON "day_book_expense_entries"("entry_date");

CREATE TABLE IF NOT EXISTS "party_collections" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "party_id" TEXT,
  "party_name" TEXT NOT NULL,
  "collection_date" DATETIME NOT NULL,
  "cash_paid" REAL NOT NULL DEFAULT 0,
  "bank_paid" REAL NOT NULL DEFAULT 0,
  "gpay_paid" REAL NOT NULL DEFAULT 0,
  "total_amount" REAL NOT NULL,
  "remarks" TEXT,
  "source_event_id" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "party_collections_source_event_id_key" ON "party_collections"("source_event_id");
CREATE INDEX IF NOT EXISTS "party_collections_party_id_idx" ON "party_collections"("party_id");
CREATE INDEX IF NOT EXISTS "party_collections_party_name_idx" ON "party_collections"("party_name");
CREATE INDEX IF NOT EXISTS "party_collections_collection_date_idx" ON "party_collections"("collection_date");

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entity_name" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "payload" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "audit_logs_entity_name_entity_id_idx" ON "audit_logs"("entity_name", "entity_id");

CREATE TABLE IF NOT EXISTS "roles" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "role_name" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "roles_role_name_key" ON "roles"("role_name");
