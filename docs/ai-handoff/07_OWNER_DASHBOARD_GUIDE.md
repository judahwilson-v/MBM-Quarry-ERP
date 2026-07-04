# 07_OWNER_DASHBOARD_GUIDE

This document explains the widgets on the main Dashboard, outlining what they represent and how they are calculated.

> [!WARNING]
> The current dashboard values in `src/app/dashboard/page.tsx` are static mockups. This guide explains how the calculations *should* be implemented based on the database schema.

## 1. Today's Sales
- **What it shows**: The gross monetary value of all material sold today.
- **Source Table**: `OutgoingSale`
- **SQL / Calculation**: `SUM(finalAmount)` where `saleDate` is between today at 00:00:00 and 23:59:59.
- **Business Meaning**: Top-line daily revenue generation.
- **Why it is important**: Indicates the immediate daily cash flow potential and operational volume.

## 2. Today's Purchases
- **What it shows**: The gross monetary cost of raw boulder purchased today.
- **Source Table**: `IncomingBoulder`
- **SQL / Calculation**: `SUM(amount)` where `date` is today.
- **Business Meaning**: Cost of goods acquired today.
- **Why it is important**: High purchase volume compared to sales volume implies inventory building.

## 3. Today's Expenses
- **What it shows**: Total operational expenses (Diesel, Salaries, Office) incurred today.
- **Source Table**: `Expense`
- **SQL / Calculation**: `SUM(amount)` where `expenseDate` is today.
- **Business Meaning**: Direct overhead costs for the day.
- **Why it is important**: Required to calculate daily net profit and track cash burn.

## 4. Total to Receive
- **What it shows**: Total outstanding debt owed *to* MBM Quarry by customers.
- **Source Table**: `PartyLedger`
- **SQL / Calculation**: `SUM(balance)` for all latest `PartyLedger` records where `balance > 0`.
- **Business Meaning**: Accounts Receivable (Assets).
- **Why it is important**: A high number here indicates poor cash collection and high credit risk.

## 5. Total to Pay
- **What it shows**: Total outstanding debt owed *by* MBM Quarry to suppliers.
- **Source Table**: `PartyLedger`
- **SQL / Calculation**: `SUM(balance)` for all latest `PartyLedger` records where `balance < 0` (converted to positive for display).
- **Business Meaning**: Accounts Payable (Liabilities).
- **Why it is important**: Helps the owner manage outgoing cash flow and supplier relationships.

## 6. Cash in Hand
- **What it shows**: The physical cash available at the quarry office.
- **Source Table**: `DayBook`
- **SQL / Calculation**: `closingCashBalance` of the most recent `DayBook` record.
- **Business Meaning**: Immediate liquidity.
- **Why it is important**: Ensures physical cash matches system records, preventing theft or accounting errors.

## 7. Bank Balance
- **What it shows**: The digital funds available in the business bank account(s).
- **Source Table**: `DayBook`
- **SQL / Calculation**: `closingBankBalance` of the most recent `DayBook` record.
- **Business Meaning**: Liquid banking assets.
- **Why it is important**: Crucial for paying large supplier invoices or payroll via wire transfer.
