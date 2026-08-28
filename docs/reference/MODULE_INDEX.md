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
  * `sales.ts`: Handles customer sales records, event creation, and outbox emission.
  * `purchases.ts`: Handles supplier boulder purchase logs and outbox emission.
  * `expenses.ts`: Handles operational expenses, Day Book bindings, and outbox emission.
  * `credits.ts`: Handles ledger and payment/collection actions.
  * `weighbridge.ts`: Handles weighbridge ticketing inputs.
  * `sync.ts`: Handles sync health metrics, delivery triggers, diagnostics export, and safe restore actions.

#### B. UI Components (`src/components/`)
* **Reusable UI Components**: `src/components/ui/`
* **Module Forms**: `src/components/modules/`
  * `sales-entry-form.tsx`
  * `boulder-purchase-form.tsx`
  * `expense-form.tsx`
  * `weighbridge-forms.tsx`

#### C. Business & Sync Logic (`src/lib/`)
* **Database & Migration Pipeline (`src/lib/`)**:
  * `migrations.ts`: Deterministic versioned SQLite DDL migration runner (`ALL_MIGRATIONS`, v1...v5).
  * `bootstrap.ts`: Startup schema compatibility gate and initialization.
  * `prisma.ts`: Prisma Client factory and SQLite connection lifecycle.
* **Transactional Outbox Engine (`src/lib/sync/`)**:
  * `outbox.ts`: Atomic outbox event enqueueing (`enqueueOutboxEvent`), delivery dispatcher (`deliverPendingOutbox`), and retry engine.
  * `delivery-gate.ts`: Domain-by-domain cutover gate (`isOutboxDeliveryEnabled`, `isLegacyPushMutationEnabled`, `isLegacyPullRowCopyEnabled`).
  * `staged-restore.ts` & `restore-files.ts`: Safe staged restore, staging validation, pre-restore backups (`.bak`), and atomic file swapping.
  * `sync-health.ts`: Pure read sync health summary (`getDetailedSyncHealth`), outbox backlog metrics, and machine error classification.
  * `cutover-manifest.ts`: 29-model cutover readiness and migration status ledger.
  * `device-identity.ts`: Hardware-anchored persistent device registration.
  * `lease.ts`: Sync lease mutual exclusion wrapper (`withSyncLease`).
  * `sync-config.ts`: Synced model definitions and priority order.
  * `sync-service.ts`: Legacy CDC push/pull loop (with safe cutover bypasses and retired operation guards).
* **Domain Services (`src/lib/domain/`)**:
  * Isolates business services from actions (party balance, daybook, inventory stock, financial events).
* **Pricing Engine (`src/lib/sales-engine.ts`)**:
  * MBM-wide rules for CFT, discount value, CGST/SGST calculations.
