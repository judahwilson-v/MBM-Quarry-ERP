---
type: adr
last_updated: 2026-08-18
---
# ADR-002: Sync Model Architecture

## Context
Operating offline-first with a local SQLite database requires a mechanism to periodically synchronize data with a central cloud database (Supabase) to support multi-device scenarios and the separate Owner Dashboard. The synchronization process must handle foreign key dependencies carefully, resolve data conflicts gracefully, and manage large volumes of audit data efficiently without overwhelming either the local or remote systems.

## Decision
We implement a custom synchronization model with the following specific rules:

- **Push/Pull Priority Order**: 
  - To avoid Foreign Key (FK) violations, parent models must be pushed and pulled first. 
  - Push priority order: GlobalSettings(1), Material(2), Party(3), Supplier(4), Employee(5), FinancialEvent(6)... down to WeighbridgeTicket(29).
  - Pull order mirrors the push priority in reverse to ensure the same FK safety.
- **Direct Push Models**: FinancialEvent, LedgerEntry, InventoryStock, and InventoryTransaction are pushed directly to the remote server without generating audit row triggers.
- **Conflict Resolution Strategies**:
  - *Materials*: If a P2002 name conflict occurs, the system updates the rate and timestamp on the existing record.
  - *Sales & Boulders*: Compares timestamps; the remote record wins if it is newer, but the local record is preserved if it is newer.
  - *Entities (Party, Vehicle, Supplier, Employee)*: Appends ` (Merge <last 4 of ID>)` to the entity names on collision.
  - *WeighbridgeTickets*: Adds 900000 to the `ticketNumber` on collision.
- **Retention Policies**: 
  - Remote (Supabase): `audit_logs` older than 3 days are deleted. `financial_events`, `ledger_entries`, and `inventory_transactions` older than 30 days are deleted.
  - Local (SQLite): Retains all data indefinitely.
- **Cursor Safety**: A 10-second `SAFETY_WINDOW_MS` is subtracted from sync cursors to protect against device clock skew and ensure no records are missed during sync sweeps.
- **FK Holding Queue**: Incorporates an `earliestSkippedTime` mechanism for re-evaluating skipped child records that failed to sync due to missing parents.

## Alternatives Considered
- *Standard ORM Sync Tools*: Often lack the granular conflict resolution strategies needed for quarry-specific edge cases (like merging entity names or handling ticket number collisions).
- *Strict Last-Write-Wins for Everything*: Rejected because it leads to silent data loss for entities and materials; custom merge logic provides better traceability.
- *Infinite Cloud Retention*: Rejected to save cloud storage costs and maintain sync performance, given the local SQLite acts as the true long-term archive.

## Consequences
- Synchronization is resilient against FK constraint errors and clock drift.
- Conflicts are resolved deterministically with minimal user intervention.
- The cloud database remains lean and performant, while the local database serves as the complete historical archive.
- The custom sync logic adds complexity and requires careful testing, especially the holding queue and cursor management.

## Immutability Rules
- Parent entities must always sync before child entities.
- Direct push models must never trigger audit rows.
- Local SQLite data must never be pruned by the sync retention policies.
