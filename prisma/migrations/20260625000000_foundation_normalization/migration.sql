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
