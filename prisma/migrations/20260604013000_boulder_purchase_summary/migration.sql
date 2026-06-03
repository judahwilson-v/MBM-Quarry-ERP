-- Dedicated boulder purchase register and persisted sales summaries.

CREATE TABLE "daily_summary" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "materialTotals" JSONB NOT NULL,
    "cashSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_summary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "weekly_summary" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "materialTotals" JSONB NOT NULL,
    "cashSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_summary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_entries" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "time" TEXT,
    "vehicleId" TEXT,
    "vehicleNumber" TEXT NOT NULL,
    "supplierId" TEXT,
    "supplierName" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "remarks" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_summary_date_key" ON "daily_summary"("date");
CREATE UNIQUE INDEX "weekly_summary_weekStart_weekEnd_key" ON "weekly_summary"("weekStart", "weekEnd");

CREATE INDEX "purchase_entries_date_idx" ON "purchase_entries"("date");
CREATE INDEX "purchase_entries_vehicleId_idx" ON "purchase_entries"("vehicleId");
CREATE INDEX "purchase_entries_supplierId_idx" ON "purchase_entries"("supplierId");
CREATE INDEX "purchase_entries_deletedAt_idx" ON "purchase_entries"("deletedAt");

ALTER TABLE "purchase_entries"
  ADD CONSTRAINT "purchase_entries_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchase_entries"
  ADD CONSTRAINT "purchase_entries_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
