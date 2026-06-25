# MBM Decisions

This document records irreversible or long-lived project decisions.

It is separate from the business spec:

- Business spec explains what MBM must do.
- Decisions explains why the project was locked to a specific implementation choice.

## Decision 001: Payment Storage

- Store explicit payment components:
  - `cashPaid`
  - `bankPaid`
  - `gPayPaid`
  - `remainingCredit`
- Do not collapse payments into a single enum field.
- Reason: mixed payments are part of the quarry workflow.

## Decision 002: Vehicle Quantity Default

- Default quantity from vehicle capacity rules when available.
- Quantity remains editable.
- If the user changes the default, the reason should be captured in the workflow when the sales engine is implemented.

## Decision 003: Roles

- Planned roles:
  - Owner
  - Manager
  - Salesman
- Roles remain schema-prepared before auth is implemented.

## Decision 004: Edit Password

- Sales edit and delete protection uses password `1177`.
- This remains a business rule until authentication replaces it later.

## Decision 005: Architecture Path

- Offline SQLite is the current operational source of truth.
- Supabase sync is a later phase.
- Electron desktop packaging is a later phase.

## Decision 006: Normalization Strategy

- Preserve legacy text fields while adding normalized foreign keys.
- Migrate one workflow at a time.
- Do not drop compatibility fields until the associated workflow has been fully rewritten and verified.

## Decision 007: Business Logic Layering

- Business rules must be isolated from UI as much as possible.
- UI should call the engine, not embed the engine.
- Future phases should prefer testable service functions over ad hoc component logic.

## Decision 008: Audit Direction

- Log critical mutations as the project matures.
- Keep audit lightweight before full authentication exists.
- Expand audit metadata later rather than blocking the current offline product.

## Decision 009: Phase Discipline

- Freeze a phase before starting the next one.
- Use docs and tests to approve a phase before code changes begin.
- Prefer small, reviewable increments over large rewrites.
