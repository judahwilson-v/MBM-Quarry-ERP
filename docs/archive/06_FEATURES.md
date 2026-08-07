# 06_FEATURES

This document tracks the feature set of the MBM ERP system.

## Implemented Features
- **Electron Desktop Shell**: Packaged for Windows with embedded SQLite and Node runtime.
- **Auto-Updater**: GitHub Releases integration via `electron-updater` with robust UI toasts.
- **Offline-First SQLite**: Local operations without internet dependency.
- **Event Sourcing Ledger**: Financial transactions are immutable and generate reconstructable balances.
- **Sales Module (`OutgoingSale`)**: Invoice creation, discount calculation, GST calculation, cash/bank splitting.
- **Purchases Module (`IncomingBoulder`)**: Raw material ingestion, automated trip counting, payments.
- **Party Ledger**: Unified balance tracking for Customers and Suppliers.
- **Expenses**: Tracking operational costs (Diesel, Maintenance, Office).
- **DayBook**: End-of-day reconciliation of Cash and Bank transactions.
- **Master Data**: UI to manage Vehicles, Parties, and Materials.
- **Supabase Sync**: Background synchronization to cloud for backup/cross-device support.
- **Dark/Light Mode**: User-selectable UI themes.

## Partially Completed Features
- **Dashboard Calculations**: The UI is built (`src/app/dashboard`), but values (e.g. Today's Sales, Cash in Hand) are currently static mockups.
- **Printing**: Silent printing is implemented via Electron IPC, but thermal printer templates (receipts) require styling adjustments.
- **Inventory Tracking**: The `InventoryStock` tables exist, but automated updates via `InventoryTransaction` are not fully wired into the Sales/Purchase UI.
- **Tally Export**: XML generation logic exists (`tally.ts`), but full UI mapping might be incomplete.

## Planned / Missing Features
- **Profit & KPI Calculations**: Cost-per-ton and Net Profit calculations are missing from the Dashboard.
- **Role-Based Access Control (RBAC)**: `Role` table exists, but granular page-level permissions are not strictly enforced beyond a global Admin PIN.
- **Android / Mobile App**: Not implemented. Cloud Supabase sync paves the way for this.
- **Data Analytics / Charts**: The dashboard lacks historical visual charts (e.g., Sales over 30 days).
- **Employee Payroll**: Advanced salary generation and attendance tracking.
