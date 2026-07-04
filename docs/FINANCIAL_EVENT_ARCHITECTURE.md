# Financial Event Architecture

This document is the canonical reference for MBM’s financial system architecture.

It defines how MBM models quarry operations, financial consequences, and rebuildable projections.

## 1. Philosophy

MBM is built around quarry operations, not accounting tables.

- Quarry operations create business actions.
- Business actions create domain events.
- Some domain events create financial events.
- Financial events are the immutable business truth for monetary movement.
- Ledger, Day Book, Dashboard, and Reports are projections derived from events.

This design keeps MBM aligned with how the quarry actually operates while avoiding duplicated accounting logic across modules.

## 2. Financial Event Definition

A financial event is one completed business action with financial impact.

Examples:

- Sale Created
- Sale Corrected
- Sale Voided
- Credit Collection
- Supplier Payment
- Diesel Expense
- Labour Expense
- Employee Advance
- Employee Repayment

Not every domain event is financial.

Example:

- `Vehicle Created` is a domain event, but not a financial event.
- `Sale Created` is a domain event and, because it changes financial position, also produces a financial event.

## 3. Event Lifecycle

The event lifecycle is:

Business Action
↓
Domain Event Created
↓
Financial Event Created, if applicable
↓
Validation
↓
Persisted
↓
Ledger Projection
↓
Day Book Projection
↓
Reports
↓
Dashboard

No layer should skip directly to a projection as the source of truth.

## 4. Event Types

Event types are staged by phase to prevent uncontrolled growth.

### Phase 1

- `SALE_CREATED`
- `SALE_UPDATED`
- `SALE_DELETED`
- `CREDIT_COLLECTION`

### Phase 2

- `PURCHASE_CREATED`
- `PURCHASE_UPDATED`
- `SUPPLIER_PAYMENT`
- `EXPENSE_CREATED`

### Phase 3

- `STOCK_ADJUSTMENT`
- `PRODUCTION_ENTRY`
- `MACHINE_EXPENSE`
- `PAYROLL`
- `etc`

Domain events can exist without financial impact, but financial events must always map to a recognizable operational action.

## 5. Event Contract

Every financial event must contain immutable fields.

Mandatory fields:

- Event ID
- Event Type
- Business Entity
- Entity ID
- Timestamp
- Actor or System Source
- Financial Breakdown
- Metadata
- Version

Immutability rules:

- Event ID is immutable.
- Event Type is immutable.
- Business Entity is immutable.
- Entity ID is immutable.
- Timestamp is immutable.
- Actor or System Source is immutable once written.
- Financial Breakdown is immutable once written.
- Metadata is append-only from the perspective of the event history; corrections create new events.
- Version is immutable.

Corrections do not edit prior events.

Instead, they create new events such as:

- `SALE_CORRECTED`
- `SALE_VOIDED`

## 6. Projection Rules

Financial events are immutable.

These outputs are projections and must be rebuildable from event history:

- Ledger
- Day Book
- Dashboard
- Reports

Projection rules:

- Projections may be deleted and regenerated.
- If a projection becomes corrupted, it is rebuilt from the event stream.
- Projections must never become the source of truth.
- A projection should not invent new financial facts.

The financial event history is the source of truth.

## 7. Failure Scenarios

### Projection Failure

If ledger, day book, report, or dashboard projection generation fails:

- the underlying event remains persisted
- the failed projection can be retried
- the projection can be rebuilt from the event stream

### Sync Interruption

If offline sync is interrupted:

- local event history remains intact
- unsynced events remain queued
- sync resumes from the last confirmed boundary
- event history itself is not rewritten

### Duplicate Event

If the same business action is processed twice:

- deduplication should be based on event identity and business entity identity
- duplicate attempts must not create conflicting financial truth
- if uncertainty exists, prefer rejecting the duplicate rather than silently merging it

### Partial Transaction

If a transaction fails midway:

- no partial financial event should be considered committed
- persistence must be atomic where possible
- if a projection fails after persistence, the event remains and the projection is retried later

### Corrupt Cache

If a cached projection becomes corrupt:

- discard the cache
- rebuild it from financial events
- never repair the cache by rewriting event history

## 8. Offline Strategy

Offline is a core requirement.

Offline flow:

Business Action
↓
Domain Event
↓
Financial Event
↓
SQLite
↓
Later Sync
↓
Cloud

Sync must never change event history.

Sync only moves already-created events to a remote system.

## 9. Future Evolution

The financial event system must support future growth without changing Sales semantics.

It should be able to serve:

- Multi-quarry
- Multi-user
- Cloud sync
- Mobile clients
- Analytics
- GST
- Accounting export

These capabilities should consume financial events, not redefine them.

## Facts vs. Projections

Every component in MBM must be classified as either a fact or a projection.

### Facts

Facts are immutable source-of-truth records.

- Domain Events
- Financial Events

### Projections

Projections are rebuildable views derived from facts.

- Ledger
- Day Book
- Dashboard
- Reports
- Analytics
- Future KPIs

Facts are never regenerated from projections.

The flow is always one-way:

Business Action
↓
Domain Event (Fact)
↓
Financial Event (Fact, if applicable)
↓
Ledger (Projection)
↓
Day Book (Projection)
↓
Reports (Projection)
↓
Dashboard (Projection)

## Architectural Invariants

- Events are append-only.
- Facts are immutable.
- Projections are disposable and rebuildable.
- Business logic belongs in domain services.
- UI never owns business rules.
- Cached values are never the source of truth.
- Offline-first is a non-negotiable requirement.
- Financial events are created only after successful business validation.

## Event Identity

Every financial event must include:

- Globally unique Event ID
- Creation timestamp
- Event version
- Correlation ID

Clarifications:

- Event version belongs to the event schema, not the business action.
- Old events are never rewritten to newer versions.
- Correlation ID groups related events, such as original sale, correction, and void.
- Cause explains why an event exists, such as user correction, system sync, or manual adjustment.
- Correlation ID and cause are distinct concepts.

## Idempotency

Idempotency is mandatory for financial event processing.

### Duplicate Submission

If the same event is submitted twice:

- detect the duplicate using event identity and correlation/business entity identity
- reject the duplicate or treat it as a no-op
- never create a second conflicting fact

### Sync Safety

If sync retries an event:

- the remote side must recognize the event identity
- duplicate ledger entries must not be created
- retries must be safe and repeatable

### Replay Safety

If events are replayed:

- replay must preserve ordering
- replay must not mutate historical facts
- replay must produce the same projections from the same input stream

## What Is Not an Event

The following are projections, not events:

- Current party balance
- Vehicle trip totals
- Dashboard totals
- Daily cash totals
- Outstanding balances

These values are computed from facts rather than stored as primary truth.

## Future Replay

Projections must be rebuildable by replaying financial events in order.

This enables:

- recovery after corruption
- migration to new reporting models
- verification of accounting consistency
- rebuilding dashboards without modifying historical events

## Architecture Governance

- New modules must conform to the Financial Event Architecture.
- Any proposal that changes event flow, immutability, or the relationship between facts and projections requires an architecture review before implementation.
- Architectural changes should be documented as versioned decisions rather than silently modifying the governing document.

## Design Note: Domain Events vs Financial Events

Domain events capture operational reality.

Examples:

- `Vehicle Created`
- `Material Updated`
- `Employee Added`

Financial events capture monetary consequence.

Examples:

- `Sale Created`
- `Credit Collection`
- `Supplier Payment`

This distinction matters because MBM will grow beyond accounting into stock, maintenance, production, and dispatch.

The rule is:

- every financial event is also a domain event
- not every domain event is a financial event

## Architectural Rule

MBM must follow this direction:

Business Action
↓
Domain Event
↓
Financial Event, if applicable
↓
Ledger
↓
Day Book
↓
Reports
↓
Dashboard

The financial event stream is the durable business truth.

The ledger is a projection.

The day book is a projection.

Reports are projections.

Dashboard data is a projection.
