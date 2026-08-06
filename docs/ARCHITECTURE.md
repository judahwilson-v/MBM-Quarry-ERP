# MBM Quarry ERP — Architecture

## Runtime Stack
- **Frontend & API**: Next.js 14 (App Router, RSC)
- **Database**: SQLite via Prisma ORM (`prisma/dev.db` in dev, `%APPDATA%/mbm-quarry-erp/quarry.db` in production)
- **Desktop Shell**: Electron (wraps the Next.js standalone server)
- **Cloud Sync**: Supabase (secondary, offline-first queue)

## Source Layout & Folder Structure

*   **desktop/**: Contains the Electron wrapper code (e.g., `main.js`). Responsible for launching the Next.js server locally, managing application window lifecycle, handling database file operations, and managing database persistence/fallback operations (like the Factory Reset fallback).
*   **prisma/**: Contains the Prisma schema (`schema.prisma`), migrations, seed scripts (`seed.ts`), and development/bundled local SQLite database files (`dev.db`).
*   **scripts/**: Utility and build-time tooling scripts (e.g., manual database migration script `migrate.js`, version stamping `stamp-version.js`).
*   **src/**: The core Next.js application codebase.
    *   **src/app/**: Next.js 14 App Router definitions, routes, pages, RSCs, layouts, and server action endpoints (`src/app/actions/`).
    *   **src/components/**: Reusable React components (UI elements, domain module forms, layout shells).
    *   **src/lib/**: Core business logic, database access, utilities, and background cloud sync engine.
        *   **src/lib/domain/**: Domain-driven service modules (e.g., inventory, daybook, ledger) isolating business rules from UI components.
        *   **src/lib/prisma.ts**: Prisma client instantiation and raw SQLite fallback initialization.
        *   **src/lib/sales-engine.ts**: Business engine for pricing, GST, rate calculations, and invoice totals.
        *   **src/lib/offline-actions.ts**: Core server actions for local database operations.
*   **main.js**: Electron main process entry point handling server spawning and IPC.
*   **package.json**: Defines project dependencies, Next.js standalone build scripts, and electron-builder packaging configurations.
*   **docs/**: Master system documentation, business rules, architectural specs, and ADR logs.

## Data Flow
```
Client Component
   ↓  calls
Server Action (src/app/actions/)
   ↓  validates
Domain Service / Business Engine
   ↓  emits
Financial Event  →  persisted to SQLite
   ↓  projected to
Ledger  |  Day Book  |  Reports  |  Dashboard
   ↓  queued to
Supabase Sync (background, offline-safe)
```

## Financial Event Invariants
- Facts (Domain Events, Financial Events) are **immutable**.
- Ledger, Day Book, Reports, and Dashboard are **rebuildable projections**.
- Corrections never edit prior events — they create new `SALE_CORRECTED` / `SALE_VOIDED` events.
- See `docs/FINANCIAL_EVENT_ARCHITECTURE.md` for the full reference.

## Core Invariants
1. Business logic belongs in domain services, never in UI components.
2. Offline operation must always remain functional — SQLite is the primary source of truth.
3. Cloud sync must never alter business history.
4. Projections are disposable and rebuildable from the event stream.
5. New features must reuse existing services whenever possible.

## Electron Data Persistence
- On first launch, `main.js` copies the pristine `prisma/dev.db` into the OS user-data directory.
- On subsequent launches it uses the existing `quarry.db` as-is.
- App code (in `Program Files` / `.app`) is fully decoupled from app data (`%APPDATA%/quarry.db`).
- This means app upgrades **never** overwrite business data.

## Related Docs
- `docs/DEPLOYMENT.md` — packaging, release and update workflow
- `docs/FINANCIAL_EVENT_ARCHITECTURE.md` — full event system reference
- `docs/BUSINESS_RULES.md` — quarry-specific business rules
- `docs/DECISIONS.md` — long-lived architecture decisions

## 🚨 MANDATORY DATABASE CHANGE PROTOCOL

This project uses **three sources of truth** for its database schema:
1. `prisma/schema.prisma`
2. `src/lib/prisma.ts` (raw SQLite initialization queries)
3. Supabase SQL migration files (for cloud sync)

**Every DB change MUST update ALL of the following:**
1. `prisma/schema.prisma`
2. `src/lib/prisma.ts` (raw SQLite `CREATE TABLE` and `$executeRawUnsafe` initialization)
3. Supabase migration SQL
4. `prisma/seed.ts` (if required for base data)
5. Sync engine (`src/lib/sync/`) if tables are being synced

Failure to update all sources of truth simultaneously will result in production crashes due to schema mismatches between the initial local database, the Prisma client, and the cloud sync engine.
