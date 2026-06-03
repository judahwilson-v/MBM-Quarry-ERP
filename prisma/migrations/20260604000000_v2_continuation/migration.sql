-- MBM Quarry v2 continuation migration.
-- Converts legacy MT quantity fields to CFT where the old material unit was MT.

-- Role enum replacement with legacy role mapping.
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'ACCOUNTANT', 'SUPERVISOR', 'OPERATOR', 'STORE_MANAGER');
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "Role"
  USING (
    CASE "role"::text
      WHEN 'GENERAL_MANAGER' THEN 'MANAGER'
      WHEN 'WEIGHBRIDGE_OPERATOR' THEN 'OPERATOR'
      WHEN 'DATA_ENTRY_OPERATOR' THEN 'OPERATOR'
      ELSE "role"::text
    END
  )::"Role";
DROP TYPE "Role_old";

-- Extended enums.
ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'GPAY';
ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'MIXED';
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'GPAY_SALE';
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'PAYMENT_RECEIVED';

CREATE TYPE "MaterialUnit" AS ENUM ('CFT');
CREATE TYPE "PurchaseCategory" AS ENUM ('MATERIAL', 'DIESEL', 'SPARE_PARTS', 'MAINTENANCE', 'SALARY', 'OTHER');
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- Party master.
ALTER TABLE "Party" DROP COLUMN "creditLimit";

-- Vehicle master.
ALTER TABLE "Vehicle"
  ADD COLUMN "companyBody" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "extraBody" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isPickup" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "bodyRemarks" TEXT;

-- Material master and CFT conversion.
ALTER TABLE "Material"
  ADD COLUMN "currentRate" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Material"
SET
  "currentStock" = ROUND(("currentStock" * 35.315)::numeric, 3),
  "reorderLevel" = ROUND(("reorderLevel" * 35.315)::numeric, 3)
WHERE "unit" = 'MT';

DROP INDEX IF EXISTS "Material_type_idx";
ALTER TABLE "Material" DROP COLUMN "type";
ALTER TABLE "Material" ALTER COLUMN "unit" DROP DEFAULT;
ALTER TABLE "Material"
  ALTER COLUMN "unit" TYPE "MaterialUnit"
  USING 'CFT'::"MaterialUnit";
ALTER TABLE "Material" ALTER COLUMN "unit" SET DEFAULT 'CFT';
DROP TYPE "MaterialType";

CREATE INDEX "Material_isActive_idx" ON "Material"("isActive");

CREATE TABLE "MaterialPriceHistory" (
  "id" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "oldRate" DECIMAL(18,2) NOT NULL,
  "newRate" DECIMAL(18,2) NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changedBy" TEXT NOT NULL,
  CONSTRAINT "MaterialPriceHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MaterialPriceHistory_materialId_changedAt_idx" ON "MaterialPriceHistory"("materialId", "changedAt");
ALTER TABLE "MaterialPriceHistory" ADD CONSTRAINT "MaterialPriceHistory_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Sales v2 monetary model.
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_vehicleId_fkey";
ALTER TABLE "Sale" ALTER COLUMN "vehicleId" DROP NOT NULL;
ALTER TABLE "Sale" RENAME COLUMN "amount" TO "netAmount";
ALTER TABLE "Sale"
  ADD COLUMN "driverId" TEXT,
  ADD COLUMN "grossAmount" DECIMAL(18,2),
  ADD COLUMN "discountType" "DiscountType",
  ADD COLUMN "discountValue" DECIMAL(18,2),
  ADD COLUMN "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "cashAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "bankAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "gpayAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "creditAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "operatorName" TEXT,
  ADD COLUMN "printCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "Sale" SET "grossAmount" = "netAmount";
UPDATE "Sale" SET "cashAmount" = "netAmount" WHERE "paymentType" = 'CASH';
UPDATE "Sale" SET "bankAmount" = "netAmount" WHERE "paymentType" = 'BANK';
UPDATE "Sale" SET "creditAmount" = "netAmount" WHERE "paymentType" = 'CREDIT';
ALTER TABLE "Sale" ALTER COLUMN "grossAmount" SET NOT NULL;

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ledger entry typing.
ALTER TABLE "LedgerEntry"
  ADD COLUMN "purchaseId" TEXT,
  ADD COLUMN "entryType" TEXT NOT NULL DEFAULT 'ADJUSTMENT';
UPDATE "LedgerEntry" SET "entryType" = 'SALE_CREDIT' WHERE "saleId" IS NOT NULL AND "debitAmount" > 0;
UPDATE "LedgerEntry" SET "entryType" = 'PAYMENT_RECEIVED' WHERE "creditAmount" > 0;
ALTER TABLE "LedgerEntry" ALTER COLUMN "entryType" DROP DEFAULT;

-- Purchases, suppliers, employees, pending book.
CREATE TABLE "Supplier" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "address" TEXT,
  "gstNumber" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");
CREATE INDEX "Supplier_deletedAt_idx" ON "Supplier"("deletedAt");

CREATE TABLE "Purchase" (
  "id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "category" "PurchaseCategory" NOT NULL,
  "supplierId" TEXT,
  "materialId" TEXT,
  "description" TEXT NOT NULL,
  "qty" DECIMAL(18,3),
  "unit" TEXT,
  "rate" DECIMAL(18,2),
  "amount" DECIMAL(18,2) NOT NULL,
  "paymentType" "PaymentType" NOT NULL,
  "invoiceRef" TEXT,
  "remarks" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Purchase_date_idx" ON "Purchase"("date");
CREATE INDEX "Purchase_category_idx" ON "Purchase"("category");
CREATE INDEX "Purchase_supplierId_idx" ON "Purchase"("supplierId");
CREATE INDEX "Purchase_materialId_idx" ON "Purchase"("materialId");
CREATE INDEX "Purchase_deletedAt_idx" ON "Purchase"("deletedAt");
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Employee" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "baseSalary" DECIMAL(18,2) NOT NULL,
  "phone" TEXT,
  "joinDate" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Employee_name_idx" ON "Employee"("name");
CREATE INDEX "Employee_deletedAt_idx" ON "Employee"("deletedAt");

CREATE TABLE "PendingBook" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amount" DECIMAL(18,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "notes" TEXT,
  "isDeducted" BOOLEAN NOT NULL DEFAULT false,
  "deductedOn" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PendingBook_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PendingBook_employeeId_date_idx" ON "PendingBook"("employeeId", "date");
CREATE INDEX "PendingBook_isDeducted_idx" ON "PendingBook"("isDeducted");
ALTER TABLE "PendingBook" ADD CONSTRAINT "PendingBook_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Accounts book GPay support.
ALTER TABLE "AccountsEntry" ADD COLUMN "isGpay" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "AccountsEntry_isGpay_idx" ON "AccountsEntry"("isGpay");
