# 01_DATABASE_SCHEMA

This document details every table in the Prisma schema for the MBM ERP system, providing context and exact technical requirements.

## 1. `Vehicle`
**Purpose**: Stores all trucks/vehicles that transport materials.
**Primary Key**: `id` (String, cuid)
**Relationships**:
- Belongs to `Party` (optional)
- Has many `OutgoingSale`, `IncomingBoulder`, `Expense`, `FuelPurchase`

| Column | Type | Nullable | Default | Constraints/Indexes |
|---|---|---|---|---|
| `id` | String | No | `cuid()` | `@id` |
| `vehicleNumber` | String | No | - | `@unique` (`vehicle_number`) |
| `partyId` | String | Yes | - | FK to `Party(id)`, Indexed |
| `partyName` | String | Yes | - | - |
| `companyBodyQty` | Float | Yes | - | - |
| `extraBodyQty` | Float | Yes | - | - |
| `tripCount` | Int | No | `0` | - |
| `createdAt` | DateTime | No | `now()` | - |
| `updatedAt` | DateTime | No | `now()` | - |

**Example Record**:
```json
{
  "id": "cl...",
  "vehicleNumber": "TN 01 AB 1234",
  "partyId": "cl...",
  "partyName": "ABC Transporters",
  "companyBodyQty": 400.0,
  "tripCount": 5
}
```

## 2. `Party`
**Purpose**: Stores customers, suppliers, and transporters. The central entity for ledgers.
**Primary Key**: `id` (String, cuid)
**Relationships**:
- Has many `Vehicle`, `OutgoingSale`, `IncomingBoulder`, `PartyCredit`, `PartyCollection`, `PartyLedger`, `PartyPayment`, `Expense`

| Column | Type | Nullable | Default | Constraints/Indexes |
|---|---|---|---|---|
| `id` | String | No | `cuid()` | `@id` |
| `partyName` | String | No | - | `@unique` |
| `phone` | String | Yes | - | - |
| `address` | String | Yes | - | - |
| `createdAt` | DateTime | No | `now()` | - |
| `updatedAt` | DateTime | No | `now()` | - |

## 3. `Material`
**Purpose**: Defines product catalog (e.g. 20mm, Dust, Boulder).
**Primary Key**: `id` (String, cuid)
**Relationships**: Has many `OutgoingSale`, `IncomingBoulder`

| Column | Type | Nullable | Default | Constraints/Indexes |
|---|---|---|---|---|
| `id` | String | No | `cuid()` | `@id` |
| `materialName` | String | No | - | `@unique` |
| `ratePerCft` | Float | No | `0` | - |
| `createdAt` | DateTime | No | `now()` | - |
| `updatedAt` | DateTime | No | `now()` | - |

## 4. `OutgoingSale`
**Purpose**: Records individual sale invoices/trips of material leaving the quarry.
**Primary Key**: `id` (String, cuid)
**Relationships**: Belongs to `Vehicle`, `Party`, `Material`. Has many `PartyCredit`.

| Column | Type | Nullable | Default | Constraints/Indexes |
|---|---|---|---|---|
| `id` | String | No | `cuid()` | `@id` |
| `saleDate` | DateTime | No | - | Indexed |
| `serialNumber` | Int | Yes | - | `@unique` |
| `bookNumber` | Int | Yes | - | - |
| `pageNumber` | Int | Yes | - | - |
| `vehicleId` | String | Yes | - | FK to `Vehicle(id)`, Indexed |
| `partyId` | String | Yes | - | FK to `Party(id)`, Indexed |
| `materialId` | String | Yes | - | FK to `Material(id)`, Indexed |
| `vehicleNumber` | String | No | - | - |
| `partyName` | String | No | - | - |
| `materialName` | String | No | - | - |
| `ratePerCft` | Float | No | - | - |
| `qty` | Float | No | - | - |
| `originalQty` | Float | Yes | - | - |
| `quantityReason` | String | Yes | - | - |
| `tripDelta` | Int | No | `1` | - |
| `discountType` | String | No | `"fixed"` | - |
| `discountValue` | Float | No | `0` | - |
| `amount` | Float | No | - | Base amount before tax/discount |
| `gstEnabled` | Boolean | No | `false` | - |
| `gstRate` | Float | No | `5` | - |
| `sgst` | Float | No | `0` | - |
| `cgst` | Float | No | `0` | - |
| `gstAmount` | Float | No | `0` | - |
| `finalAmount` | Float | No | - | After tax and discount |
| `cashPaid` | Float | No | `0` | - |
| `bankPaid` | Float | No | `0` | - |
| `gPayPaid` | Float | No | `0` | - |
| `paidTotal` | Float | No | `0` | - |
| `remainingCredit` | Float | No | `0` | Amount unpaid |
| `remarks` | String | Yes | - | - |

## 5. `FinancialEvent`
**Purpose**: Event Sourcing backbone. Stores immutable events for all financial operations.
**Primary Key**: `id` (String, cuid)

| Column | Type | Nullable | Default | Constraints/Indexes |
|---|---|---|---|---|
| `id` | String | No | `cuid()` | `@id` |
| `eventId` | String | No | `uuid()` | `@unique` |
| `correlationId` | String | No | - | Indexed |
| `eventType` | String | No | - | Indexed |
| `entityType` | String | No | - | Indexed with `entityId` |
| `entityId` | String | No | - | - |
| `schemaVersion` | Int | No | `1` | - |
| `payload` | Json | No | - | Stores full event payload |
| `createdAt` | DateTime | No | `now()` | - |

## 6. `LedgerEntry`
**Purpose**: Projected read model for the general ledger. Used to rebuild balances from `FinancialEvent`.
**Primary Key**: `id` (String, cuid)

| Column | Type | Nullable | Default | Constraints/Indexes |
|---|---|---|---|---|
| `id` | String | No | `cuid()` | `@id` |
| `financialEventId`| String | No | - | `@unique` |
| `correlationId` | String | No | - | Indexed |
| `eventType` | String | No | - | Indexed |
| `entityType` | String | No | - | Indexed with `entityId` |
| `entityId` | String | No | - | - |
| `entryDate` | DateTime | No | - | - |
| `cashAmount` | Float | No | `0` | - |
| `bankAmount` | Float | No | `0` | - |
| `gPayAmount` | Float | No | `0` | - |
| `creditAmount` | Float | No | `0` | - |
| `totalAmount` | Float | No | `0` | - |
| `createdAt` | DateTime | No | `now()` | - |

## 7. `DayBook`
**Purpose**: Daily summary of all cash and bank inflows/outflows for reconciliation.
**Primary Key**: `id` (String, cuid)

| Column | Type | Nullable | Default | Constraints/Indexes |
|---|---|---|---|---|
| `id` | String | No | `cuid()` | `@id` |
| `businessDate` | DateTime | No | - | `@unique` |
| `openingCashBalance` | Float | No | `0` | - |
| `openingBankBalance` | Float | No | `0` | - |
| `cashSalesTotal`| Float | No | `0` | - |
| `bankSalesTotal`| Float | No | `0` | - |
| `gPaySalesTotal`| Float | No | `0` | - |
| `expenseTotal` | Float | No | `0` | - |
| `closingCashBalance` | Float | No | `0` | - |
| `closingBankBalance` | Float | No | `0` | - |

## 8. `DayBookExpenseEntry`
**Purpose**: Individual expenses linked to a DayBook.
**Primary Key**: `id` (String, cuid)

| Column | Type | Nullable | Default | Constraints/Indexes |
|---|---|---|---|---|
| `id` | String | No | `cuid()` | `@id` |
| `dayBookId` | String | No | - | FK to `DayBook(id)` |
| `sourceEventId` | String | No | - | `@unique` (links to `FinancialEvent`) |
| `expenseType` | String | No | - | - |
| `entryDate` | DateTime | No | - | Indexed |
| `amount` | Float | No | - | - |
| `description` | String | Yes | - | - |

## 9. `IncomingBoulder`
**Purpose**: Records raw material (Boulder) purchased/arriving at the quarry for crushing.
**Primary Key**: `id` (String, cuid)

| Column | Type | Nullable | Default | Constraints/Indexes |
|---|---|---|---|---|
| `id` | String | No | `cuid()` | `@id` |
| `date` | DateTime | No | `now()` | Indexed |
| `bookNumber` | Int | Yes | - | - |
| `pageNumber` | Int | Yes | - | - |
| `vehicleId` | String | Yes | - | FK to `Vehicle(id)`, Indexed |
| `partyId` | String | Yes | - | FK to `Party(id)`, Indexed |
| `materialId` | String | Yes | - | FK to `Material(id)`, Indexed |
| `vehicleNumber` | String | No | - | - |
| `partyName` | String | No | - | - |
| `materialName` | String | No | `"ROCK"` | - |
| `qty` | Float | No | - | - |
| `rockRate` | Float | No | `26` | - |
| `amount` | Float | No | `0` | - |
| `paidTotal` | Float | No | `0` | Breakdowns cash/bank/gpay exist |
| `remainingCredit` | Float | No | `0` | - |
| `vehicleRent` | Float | No | `0` | - |

## 10. `PartyCredit` & `PartyCollection`
**Purpose**: `PartyCredit` tracks unpaid sale invoices. `PartyCollection` tracks payments received from parties against those credits.
**Keys**: `id` (String, cuid)
- `PartyCredit` links to `OutgoingSale` and `Party`.
- `PartyCollection` stores total cash/bank/gpay collected and a `sourceEventId`.

## 11. `PartyLedger`
**Purpose**: Running balance sheet for a customer/supplier.
**Primary Key**: `id` (String, cuid)
**Columns**: `partyId`, `date`, `type` (SALE/PURCHASE/PAYMENT), `debitAmount` (+ Asset), `creditAmount` (+ Liability), `balance` (Running balance: Positive = Owed to MBM).

## 12. `CashTransfer`
**Purpose**: Records manual transfers between Cash and Bank (e.g. depositing cash).
**Columns**: `amount`, `type` (CASH_TO_BANK, BANK_TO_CASH).

## 13. `PartyPayment`
**Purpose**: Outgoing payments made BY the quarry to Suppliers (e.g. Boulder suppliers).

## 14. `Employee` & `EmployeeLedger` & `EmployeeCredit`
**Purpose**: `Employee` stores staff details and their running `balance`. `EmployeeLedger` tracks Salary, Advances, Deductions. `EmployeeCredit` tracks pending amounts owed to employees.

## 15. `Expense`
**Purpose**: Direct expenses (fuel, tea, maintenance).
**Keys**: `sourceEventId` links it to the immutable financial ledger.

## 16. `FuelPurchase`
**Purpose**: Diesel/Petrol purchases, linked to `Vehicle`. 
**Columns**: `qtyLitre`, `pricePerLitre`, `amount`, `vehicleId`.

## 17. `SyncState`
**Purpose**: Tracks offline-first synchronization state with Supabase.
**Columns**: `lastSyncedAt`, `status` (IDLE/SYNCING/ERROR).

## 18. `GlobalSettings`
**Purpose**: App-wide configuration (Quarry Name, GST, Admin PINs).

## 19. `InventoryStock` & `InventoryTransaction`
**Purpose**: `InventoryStock` tracks running quantities of crushed material (e.g. 20mm). `InventoryTransaction` tracks every IN/OUT movement (Production vs Sales).
