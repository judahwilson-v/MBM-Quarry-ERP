# Product Requirements Document: Owner Dashboard (Phase 8)

## 1. Overview
The Owner Dashboard is a read-only, cloud-based Next.js web application designed strictly for the owner to monitor quarry operations from anywhere. It connects directly to the Supabase cloud database, entirely decoupling it from the operational Electron ERP used at the quarry.

## 2. Core Architecture
- **Data Flow**: Quarry PC (Electron/SQLite) ➔ Sync Engine ➔ Supabase ➔ Owner Dashboard (Vercel/Next.js)
- **Framework**: Next.js (App Router)
- **Database Connection**: Direct connection to Supabase via `@supabase/supabase-js`. NO connection to the local SQLite database.
- **State Management**: React Server Components for fast initial loads, with Supabase real-time subscriptions for live dashboard updates.
- **Styling**: Tailwind CSS & shadcn/ui.

## 3. Authentication & Security
- **Auth Provider**: Supabase Auth (Email/Password).
- **Access Control**: Only the business owner (and potentially designated managers) will be provisioned accounts. Self-signup will be disabled.
- **Row Level Security (RLS)**: Supabase RLS policies will enforce that authenticated users can only READ data. Mutations (INSERT/UPDATE/DELETE) will be strictly blocked for the dashboard application to preserve the Quarry PC as the single source of truth.

## 4. Feature Requirements
The dashboard must implement comprehensive, read-only analytics:
- **Financial Overviews**: Today's Sales, Monthly Sales, Daily P/L Estimate, Cash Position, Bank Balance.
- **Operational Metrics**: Material-wise Sales, Vehicle-wise Trips, Top Customers.
- **Credit & Debt**: Outstanding Party Credit, Employee Credit, Pending Collections.
- **Reporting**: Searchable Party Ledger with PDF and Excel export capabilities.
- **System Health**: ERP Sync Status, Last Sync Time, Pending Local Changes, DB Version, App Version (Requires pushing these metrics to a Supabase log from the ERP).
- **Responsiveness**: Fully optimized for Desktop, Tablet, and Mobile devices.

## 5. Deployment Plan
- **Hosting**: Vercel (Recommended for Next.js) or Netlify.
- **CI/CD**: Connected directly to a separate GitHub repository (`MBM-Owner-Dashboard`).
- **Environment**: Linked strictly to the Production Supabase project.

## 6. Development Roadmap (Post RC1)
1. **Initialize Project**: `npx create-next-app` in a new repository.
2. **Configure Supabase**: Connect to the existing Supabase instance and generate types.
3. **Implement Auth**: Build the login screen and protect all routes.
4. **Develop Widgets**: Build out the individual metric cards (Sales, Cash, Trips).
5. **Develop Reports**: Build the ledger viewing and export functionalities.
6. **Deploy**: Push to Vercel and hand off to the owner.
