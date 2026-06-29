# MBM Quarry ERP — Architecture

## Runtime Stack
- **Frontend & API**: Next.js 14 (App Router, RSC)
- **Database**: SQLite via Prisma ORM (`prisma/dev.db` in dev, `%APPDATA%/mbm-quarry-erp/quarry.db` in production)
- **Desktop Shell**: Electron (wraps the Next.js standalone server)
- **Cloud Sync**: Supabase (secondary, offline-first queue)

## Source Layout
```
src/app/           Route layer and page composition
src/components/    Shared and feature-specific UI
src/lib/           Core services (prisma.ts, offline-actions.ts, sync engine)
prisma/            Schema, migrations, seed
scripts/           Build-time tooling (stamp-version.js)
main.js            Electron main process
docs/              All project documentation
```

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
