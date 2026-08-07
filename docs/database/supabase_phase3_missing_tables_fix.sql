-- Phase 3 Fix: Add missing tables and columns to Supabase
-- Run this in the Supabase SQL Editor if any of these are missing.
-- All statements are idempotent (IF NOT EXISTS / IF NOT EXISTS).

-- 1. inventory_stock table (missing from schema_pg.prisma but in supabase_schema.sql)
CREATE TABLE IF NOT EXISTS "inventory_stock" (
    "id" TEXT NOT NULL,
    "material_name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'TONS',
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_stock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_stock_material_name_key" ON "inventory_stock"("material_name");

-- 2. inventory_transactions table
CREATE TABLE IF NOT EXISTS "inventory_transactions" (
    "id" TEXT NOT NULL,
    "stock_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "quantity_change" DOUBLE PRECISION NOT NULL,
    "reference_id" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "inventory_transactions_stock_id_idx" ON "inventory_transactions"("stock_id");
CREATE INDEX IF NOT EXISTS "inventory_transactions_date_idx" ON "inventory_transactions"("date");

-- 3. global_settings: add admin_pin and delete_pin if missing
ALTER TABLE "global_settings"
    ADD COLUMN IF NOT EXISTS "admin_pin" TEXT NOT NULL DEFAULT '8888',
    ADD COLUMN IF NOT EXISTS "delete_pin" TEXT NOT NULL DEFAULT '7711';

-- 4. Disable RLS on the two new tables
ALTER TABLE "inventory_stock" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_transactions" DISABLE ROW LEVEL SECURITY;

-- Done.
