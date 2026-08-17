# Owner Dashboard Web App — Product Requirements Document (PRD)

## 1. Overview
The **MBM Owner Dashboard** is a standalone, read-only Next.js web application designed specifically for the quarry owner. It connects directly to the Supabase PostgreSQL database to provide real-time, high-level business insights from anywhere, on any device.

**Crucial Constraint:** This is a **separate repository/project** from the main MBM Quarry ERP (which is an offline-first Electron app). The dashboard must never write data to the database; it is strictly a read-only reporting tool.

## 2. Objectives
- Provide real-time visibility into the quarry's financial and operational health.
- Ensure strict security (owner access only).
- Deliver a mobile-first, responsive experience so it can be checked on a phone.
- Monitor the health of the sync engine running at the quarry.

## 3. Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Database Access:** Supabase SDK (`@supabase/ssr` and `@supabase/supabase-js`) or Prisma connected directly to the Supabase connection string.
- **Styling:** Tailwind CSS + shadcn/ui
- **Charting:** Recharts
- **Hosting:** Vercel (recommended for seamless Next.js deployment)

## 4. Authentication & Security
- **Supabase Auth:** Email/Password login.
- **Row Level Security (RLS):** Supabase RLS policies will ensure that even if the API is exposed, only authenticated users can read the data.
- **Role:** Only specific, pre-approved email addresses (the owner) can register/login.

## 5. Core Features & Widgets

### 5.1 Real-Time Sync Status (Header Widget)
- **Last Sync Time:** Read from the `sync_state` table. Shows how fresh the data is (e.g., "Updated 2 mins ago").
- **Status Indicator:** Green if synced within the last hour, Yellow if delayed, Red if failing or disconnected.
- **Pending Changes:** Number of items waiting to sync (if available in cloud state).

### 5.2 Financial Overview (Top KPIs)
- **Today's Sales (₹):** Sum of all `OutgoingSale` amounts for the current day.
- **Monthly P/L (₹):** Revenue (Sales) minus Expenses (from the `Expense` table) for the current month.
- **Cash Position (₹):** Current calculated balance of cash-in-hand based on `DayBookEntry` and `PartyPayment` records.
- **Outstanding Receivables (₹):** Total of all negative balances across all `Party` accounts.

### 5.3 Operational Metrics
- **Vehicle Trips Today:** Count of `OutgoingSale` records for today.
- **Production (Crusher Output):** Calculated from `InventoryTransaction` if tracked, or estimated via sales.
- **Fuel Consumption:** Total diesel purchased/used today (from `FuelPurchase`).

### 5.4 Party Ledgers & Top Customers
- **Top 5 Buyers:** List of buyers with the highest volume (tons) or revenue this month.
- **Ledger Search:** A simple search bar to type a party name and see their current outstanding balance and last 5 transactions.

### 5.5 GST Summary
- **Monthly GST Output:** Calculated GST based on taxable sales.
- **GST Input (Optional):** If tracked via purchases.

### 5.6 Exports
- Buttons to download simple CSV/Excel reports for:
  - Monthly Sales
  - Monthly Expenses
  - Current Balances (All Parties)

## 6. Architecture & Data Flow

```mermaid
graph TD
    A[Quarry PC (Electron ERP)] -->|Push Sync| B[(Supabase PostgreSQL)]
    B -->|Read-Only Queries| C[Next.js Owner Dashboard]
    C -->|Renders| D[Owner's Mobile Phone / Laptop]
```

1. **Quarry ERP** creates a sale.
2. **Sync Engine** pushes the sale to Supabase within ~10 seconds.
3. **Owner Dashboard** fetches the latest data via Server Components.
4. **Revalidation:** Dashboard pages should use Next.js `revalidate` (e.g., every 60 seconds) or Supabase Realtime to keep the UI fresh without killing the database.

## 7. Implementation Milestones (Project 2)
- **Phase P2.1:** Setup Next.js project, Tailwind, and Supabase Auth.
- **Phase P2.2:** Build the Dashboard Layout and Sync Status header.
- **Phase P2.3:** Implement Top KPIs (Sales, Expenses, Cash).
- **Phase P2.4:** Implement Charts (Weekly sales trend).
- **Phase P2.5:** Implement Party Ledger lookup and Exports.
- **Phase P2.6:** Deploy to Vercel and test with real synced data.
