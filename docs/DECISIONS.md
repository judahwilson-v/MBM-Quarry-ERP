# MBM Quarry ERP — Architecture Decisions

This file records every long-lived or irreversible project decision.
- **Business Rules** → see `docs/BUSINESS_RULES.md`
- **Decisions here** → explain *why* the project is locked to a specific implementation choice.

---

## D-001: Offline-First SQLite
SQLite is the primary operational database. Supabase is secondary (sync target only).
**Reason**: The quarry must operate reliably without internet. Cloud outages must never block daily work.

## D-002: Financial Events as Source of Truth
All monetary actions create immutable `FinancialEvent` records. Ledger, Day Book, Reports, and Dashboard are projections rebuilt from events.
**Reason**: Prevents silent data drift across modules. Enables audit replay and disaster recovery.

## D-003: Rebuildable Projections
Ledger and Day Book are disposable projections. If corrupted, they are rebuilt from financial events.
**Reason**: Makes recovery deterministic. Projections are never the source of truth.

## D-004: Payment Field Decomposition
Payments are stored as explicit `cashPaid`, `bankPaid`, `gPayPaid` fields — not a single enum.
**Reason**: Mixed payments (part cash, part GPay) are a standard quarry workflow.

## D-005: Electron for Desktop Packaging
The quarry app is delivered as an Electron desktop application wrapping a Next.js standalone server.
**Reason**: Quarry office staff need a native desktop experience. Browser-only deployment is unsuitable.

## D-006: Data–Code Separation in Production
App code lives in `Program Files` (Windows) / `.app` (macOS). User data lives in `%APPDATA%/mbm-quarry-erp/quarry.db`.
**Reason**: Application upgrades must never overwrite business data.

## D-007: Legacy Field Preservation During Migration
Old text-based fields (e.g., `vehicleNumber`, `partyName`) are preserved while normalized FK columns are added alongside.
**Reason**: Existing records must remain readable. Migration happens one workflow at a time.

## D-008: Business Logic Layering
Business rules are isolated in domain service functions. UI components call the service — they never embed business rules.
**Reason**: Testability, maintainability, and ability to reuse logic across future surfaces (mobile, web dashboard).

## D-009: Phase Discipline
A phase is frozen (build passes, docs updated) before the next phase begins. Speculative features go to `IDEAS.md`, not `ROADMAP.md`.
**Reason**: Prevents uncontrolled feature creep during AI-assisted development.

## D-010: Edit Password `1177`
Sales edit and delete protection uses password `1177` until full authentication replaces it.
**Reason**: Prevents accidental mutations at the quarry counter without a full auth system.

## D-011: Auto-Updater Deferred
`electron-updater` infrastructure is prepared but **disabled** until RC1 has been used successfully at the quarry.
**Reason**: Stability and real-world validation must come before automated update risk.

## D-012: Owner Dashboard Separation
The Owner Dashboard will be a **separate Next.js web application** connecting directly to Supabase. It must not be merged into the Electron ERP.
**Reason**: Keeps each application simpler, avoids exposing the ERP directly to the internet, and allows independent deployment.

## D-013: Backup Strategy
The Backup Manager (in the About page) creates `.bak` snapshots in the user data folder. Export creates a portable `.db` file. Import overwrites the active database after explicit user confirmation.
**Reason**: Protects against accidental data loss at the quarry. Simple enough for non-technical staff to understand.
