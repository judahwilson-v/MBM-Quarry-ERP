---
type: adr
last_updated: 2026-08-18
---
# ADR-003: Financial Events Source of Truth

## Context
Financial data in the ERP system must be impeccably reliable, auditable, and resilient to corruption. In a quarry environment, standard accounting workflows involve complex scenarios such as mixed payment methods (e.g., partial cash, partial digital payments). Discrepancies between modules (e.g., Ledger vs. Day Book) can lead to severe business issues.

## Decision
We mandate an Event Sourcing approach for all monetary actions, coupled with specific domain modeling for payments:

- **D-002: Financial Events as Source of Truth**: All monetary actions create immutable `FinancialEvent` records. Secondary views such as the Ledger, Day Book, Reports, and Dashboard are projections rebuilt entirely from these events.
- **D-003: Rebuildable Projections**: The Ledger and Day Book are treated as disposable projections. If they become corrupted or out of sync, they are automatically rebuilt from the immutable financial events. 
- **D-004: Payment Field Decomposition**: Payments are modeled explicitly with `cashPaid`, `bankPaid`, and `gPayPaid` fields, rather than a single enumerated payment type.

## Alternatives Considered
- *State-based Accounting (Updating balances directly)*: Rejected because it makes it impossible to trace the history of a balance or rebuild the system if a discrepancy occurs.
- *Enum-based Payment Types*: Rejected because mixed payments (e.g., paying part of a bill in cash and the rest via Google Pay) are common at the quarry, and enums force unnatural workarounds.
- *Treating Ledger as Source of Truth*: Rejected because the ledger is fundamentally a summary; the atomic events that lead to the summary provide the necessary audit trail.

## Consequences
- Silent data drift across different financial modules is mathematically impossible, as all modules derive from the same event log.
- Disaster recovery and auditing are significantly simplified; the system can replay events to restore state.
- Supports the reality of mixed-payment transactions natively.
- Introduces performance overhead when completely rebuilding projections, though this is mitigated by incremental updates during normal operation.

## Immutability Rules
- `FinancialEvent` records must never be mutated or deleted once created; errors are corrected via compensatory events.
- Projections (Ledger, Day Book) must never be treated as the source of truth.
- Payment amounts must always be decomposed into specific method fields.
