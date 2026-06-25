# Changelog

## Phase 0 - Foundation

- Stabilized the offline SQLite + Prisma baseline.
- Normalized the database schema without breaking existing routes.
- Added source-of-truth documentation for business, database, UI, phases, and decisions.
- Kept existing modules and UI behavior intact.

## Phase 1.1A - Sales Execution Plan

- Sales business engine implemented as a dedicated pure workflow layer.
- Vehicle lookup now drives quantity defaults when available.
- Rate, amount, split payment, remaining credit, and trip update behavior are calculated from the business engine.
- Existing sales UI remains visually close to the current version.
- Build verified successfully after implementation.

## Phase 1.1B - Authorization and Accountability

- Authorization helper added for the temporary Phase 1 password gate.
- Audit service added and wired into sales, master data, boulder, and employee-credit mutations.
- Role helper scaffold added for Owner / Manager / Salesman checks.
- Build verified successfully after implementation.

## Phase 1.2 - Financial Event Foundation

- Financial Event infrastructure introduced beneath the existing application.
- Sales now emits `SALE_CREATED` financial events inside the same transaction.
- Financial event domain service and emitter pattern added.
- Build to be verified after milestone validation.

## Future Phases

- Phase 1.1B - Sales UI
- Phase 1.1C - Password 1177 protection and audit logging
- Phase 1.1D - Vehicle trip counting and credit updates
- Phase 1.1E - Final testing and documentation
- Phase 1.2 - Purchases
- Phase 1.3 - Day Book
- Phase 1.4 - Credit and collections
- Phase 1.5 - Owner dashboard
- Phase 2 - Supabase sync
- Phase 3 - Electron desktop
