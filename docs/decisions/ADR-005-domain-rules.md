---
type: adr
last_updated: 2026-08-18
---
# ADR-005: Domain Rules and Constraints

## Context
As the MBM Quarry ERP evolves, maintaining data integrity during migrations, ensuring secure operations at the quarry counter, and managing complex business rules (like bulk operations or vehicle capacities) are paramount. The codebase must remain maintainable, and development must be disciplined to avoid feature creep.

## Decision
We enforce the following domain-specific rules and development constraints:

- **D-007: Legacy Field Preservation During Migration**: When migrating database schemas, old text-based fields are preserved while new normalized Foreign Key (FK) columns are added alongside them. 
- **D-008: Business Logic Layering**: All core business rules are strictly isolated within domain service functions. UI components must call these services and are prohibited from embedding business rules directly.
- **D-009: Phase Discipline**: The development process adheres to strict phase discipline; a phase must be completely frozen before the next phase begins. Speculative features are documented in `IDEAS.md`.
- **D-010: Edit Password 1177**: To prevent accidental mutations at the fast-paced quarry counter, sales edits and deletions are protected by a hardcoded password (`1177`) until a comprehensive authentication system is implemented.
- **D-015: RAID Mode Constraints**: When executing RAID mode (bulk non-GST purge), the system must explicitly uphold business invariants, including reversing stock, decrementing vehicle trips, and publishing the corresponding sync audit events.
- **D-016: Explicit Multi-Body Vehicle Capacity**: To account for physical modifications common to quarry trucks (e.g., side boards), vehicle records optionally persist both `companyBodyQty` and `extraBodyQty`.

## Alternatives Considered
- *Destructive Schema Migrations*: Rejected because they risk data loss or render older, un-migrated records unreadable during the transition period.
- *Fat UI Components*: Rejected because embedding business logic in React components makes the system incredibly difficult to test and maintain.
- *Unrestricted Bulk Deletions*: Rejected because bypassing domain logic during bulk purges would corrupt inventory stock levels and financial ledgers.

## Consequences
- Data integrity is preserved during schema evolutions and bulk operations.
- The codebase remains clean, testable, and maintainable due to strict layering.
- AI-assisted development is kept focused by strict phase discipline.
- Temporary friction is introduced via the `1177` password, but it effectively prevents costly operational errors.

## Immutability Rules
- UI components must never contain business logic.
- Bulk operations (RAID mode) must never bypass domain invariants (stock, trips, audit events).
- Phases cannot overlap; speculative features must be deferred to `IDEAS.md`.
