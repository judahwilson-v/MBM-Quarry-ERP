# Module Index

This document maps module ownership, primary entry points, and dependencies across the MBM Quarry ERP application.

---

## Folder Ownership & Purpose

### 1. Desktop Shell (`desktop/`, `main.js`)
* **Purpose**: Hosts the Electron desktop wrapper, manages application window lifecycles, and sets up database paths.
* **Entry Point**: `main.js` (Root)
* **Key Files**:
  * `desktop/preload.js`: Context bridge for exposing safe APIs from Node to browser.
  * `desktop/main.js`: Main Electron process control.

### 2. Database Layer (`prisma/`)
* **Purpose**: Defines schema, seeding logic, and SQLite migrations.
* **Entry Point**: `prisma/schema.prisma`
* **Key Files**:
  * `prisma/schema.prisma`: SQLite data model definition.
  * `prisma/schema_pg.prisma`: PostgreSQL data model definition for Supabase.
  * `prisma/seed.ts`: Seed script for initializing metadata (e.g. materials, roles).

### 3. Application Core (`src/`)
* **Purpose**: Next.js App Router server and client logic.

#### A. Routing & Server Actions (`src/app/`)
* **Entry Point**: `src/app/layout.tsx`
* **Settings & Diagnostics (`src/app/settings/`)**:
  * `/settings/general`: System Diagnostics & Reliability
  * `/settings/about`: About & Backup
  * `/settings/sync`: Sync Dashboard
  * `/settings/user-logs`: Operator Audit Logs
  * `/settings/tally`: Tally ERP Export
* **Server Actions (`src/app/actions/`)**:
  * `sales.ts`: Handles customer sales records and event creation.
  * `purchases.ts`: Handles supplier boulder purchase logs.
  * `expenses.ts`: Handles operational expenses and Day Book bindings.
  * `credits.ts`: Handles ledger and payment/collection actions.
  * `weighbridge.ts`: Handles weighbridge ticketing inputs.

#### B. UI Components (`src/components/`)
* **Reusable UI Components**: `src/components/ui/`
* **Module Forms**: `src/components/modules/`
  * `sales-entry-form.tsx`
  * `boulder-purchase-form.tsx`
  * `expense-form.tsx`
  * `weighbridge-forms.tsx`

#### C. Business & Sync Logic (`src/lib/`)
* **Sync Engine (`src/lib/sync/`)**:
  * `sync-config.ts`: Defines topological order (`PUSH_PRIORITY`), conflict resolution mapping, and synced models.
  * `sync-service.ts`: Implements row-level push and pull sync loops with error boundaries.
* **Domain Logics (`src/lib/domain/`)**:
  * Isolates business services from actions (e.g., party balance computation, financial event creation).
* **Database Instance (`src/lib/prisma.ts`)**:
  * Initiates Prisma client and executes raw fallback SQLite DDL setup.
* **Pricing Engine (`src/lib/sales-engine.ts`)**:
  * MBM-wide rules for CFT, discount value, CGST/SGST calculations.
