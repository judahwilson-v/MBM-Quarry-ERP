# 02_BUSINESS_LOGIC

This document outlines the core domain logic for the MBM ERP system based on the database schema, event sourcing architecture, and server actions.

## Event Sourcing Architecture
MBM ERP uses an event-sourcing paradigm to maintain absolute financial truth.
- When an operation occurs (e.g. Sale, Purchase, Expense), a `FinancialEvent` is recorded with an immutable JSON payload.
- A `LedgerEntry` projection is immediately created to rebuild balances.
- The `DayBook` aggregates daily totals from these entries.

## 1. Sales Workflow (`OutgoingSale`)
- **Trigger**: A truck leaves the quarry with crushed material.
- **Process**:
  1. Record `OutgoingSale` (linked to `Vehicle`, `Party`, `Material`).
  2. Calculate `amount` = `qty` * `ratePerCft`.
  3. Apply discounts and GST. Calculate `finalAmount`.
  4. Deduct `paidTotal` (sum of `cashPaid`, `bankPaid`, `gPayPaid`).
  5. The remaining balance becomes `remainingCredit`.
  6. If `remainingCredit > 0`, generate a `PartyCredit` record.
  7. A `FinancialEvent` of type `SALE` is emitted, which writes to `PartyLedger`.
- **Inventory Impact**: Deducts from `InventoryStock` via an `InventoryTransaction`.

## 2. Purchase Workflow (`IncomingBoulder`)
- **Trigger**: A truck arrives with raw boulder.
- **Process**:
  1. Record `IncomingBoulder` (linked to `Vehicle`, `Party`).
  2. Calculate `amount` = `qty` * `rockRate` (default ₹26/ton).
  3. Deduct `paidTotal`.
  4. Generate `FinancialEvent` of type `PURCHASE`.
  5. Updates `PartyLedger` (Credit/Liability increase).
- **Inventory Impact**: Increases `InventoryStock` of "Boulder".

## 3. Credit & Collections Workflow
- **Credit**: Unpaid balances from `OutgoingSale` generate `PartyCredit` entries.
- **Collections**: When a customer pays a past debt:
  1. Record a `PartyCollection`.
  2. Specify amount across cash/bank/gpay.
  3. Emit a `PAYMENT_RECEIVED` FinancialEvent.
  4. Update `PartyLedger` (Debit/Asset decrease).

## 4. Party Ledger
- The `PartyLedger` is a running balance sheet for every Customer, Supplier, and Transporter.
- **Transactions**:
  - `SALE` increases the customer's balance (they owe MBM).
  - `PAYMENT_RECEIVED` decreases the customer's balance.
  - `PURCHASE` decreases the supplier's balance (MBM owes Supplier).
  - `PAYMENT_GIVEN` (`PartyPayment`) increases the supplier's balance.

## 5. Vehicle Workflow
- Tracks trips for transporters.
- Automatically links to `OutgoingSale` (sales) and `IncomingBoulder` (purchases).
- Can record `FuelPurchase` directly assigned to a `Vehicle`.

## 6. Expenses & DayBook
- **Expenses**: Direct operational costs (e.g., fuel, salary, maintenance).
  - Recorded in `Expense` table.
  - Generates a `DayBookExpenseEntry`.
- **DayBook**: Reconciles cash/bank on a daily basis.
  - Aggregates cash/bank from `OutgoingSale`, `IncomingBoulder`, `PartyCollection`, `PartyPayment`, and `Expense`.
  - Calculates `closingCashBalance` and `closingBankBalance`.
  - Serves as the ultimate truth for end-of-day reconciliation.

## 7. Employee Workflow
- Tracks `Employee` salary, advances, and deductions in `EmployeeLedger`.
- Maintains a running `balance` (Positive = MBM owes them, Negative = they owe MBM).

## 8. Dashboard Calculations
- **Implementation Status**: Currently a static mockup (`src/app/dashboard/page.tsx`).
- **Planned Calculations**:
  - **Today's Sales**: Sum of `finalAmount` from `OutgoingSale` where `saleDate` is today.
  - **Today's Purchases**: Sum of `amount` from `IncomingBoulder` where `date` is today.
  - **Today's Expenses**: Sum of `amount` from `Expense` where `expenseDate` is today.
  - **Total to Receive**: Sum of positive balances in `PartyLedger`.
  - **Total to Pay**: Sum of negative balances in `PartyLedger`.
  - **Cash in Hand**: `closingCashBalance` from today's `DayBook`.
  - **Bank Balance**: `closingBankBalance` from today's `DayBook`.

## 9. Profit & KPI Calculations
- **Implementation Status**: Not implemented.
- **Future Formula**:
  - `Net Profit` = Sum(Sales) - Sum(Purchases + Expenses + Fuel).
  - `Cost per Ton` = (Total Purchases + Expenses) / Total Tons Produced.
