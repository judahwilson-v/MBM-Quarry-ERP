# MBM Business Spec

This document is the source of truth for MBM workflow decisions.

It overrides assumptions in code, README files, and prior AI output.

Related source-of-truth documents:

- [MBM_DATABASE_SPEC.md](/Users/judahvijaiwilson/Website/github%20/project%20ig/MBM1/docs/MBM_DATABASE_SPEC.md)
- [MBM_UI_SPEC.md](/Users/judahvijaiwilson/Website/github%20/project%20ig/MBM1/docs/MBM_UI_SPEC.md)
- [MBM_PHASES.md](/Users/judahvijaiwilson/Website/github%20/project%20ig/MBM1/docs/MBM_PHASES.md)

## Product Principles

- Offline-first quarry ERP.
- Preserve working behavior until a phase explicitly rewrites it.
- Prefer small, incremental changes.
- Use database IDs as the canonical references once a module is normalized.
- Keep legacy text fields during transition for backward compatibility.

## Finalized Business Workflow

### Sales

- Sale entry must support vehicle lookup.
- Quantity can be auto-filled from vehicle capacity rules.
- Rate can be auto-filled from selected material or business rules.
- Payment must support split collection, including cash, bank, and GPay.
- Remaining unpaid amount becomes party credit.
- Vehicle trip counting is part of the sales workflow.
- Sales edits require password `1177`.
- Sales changes should be audit logged.
- Sales should use foreign keys where possible, while keeping legacy text fields during migration.

### Purchases

- Boulder purchase is a separate operational register.
- Purchase records should later be linked to normalized masters.
- Purchase business rules are deferred to Phase 1.2.

### Party Credit

- Party credit is derived from sales.
- Credit totals should reflect the final unpaid amount after payments.
- Credit views are reporting/collection-oriented, not manually edited source-of-truth records.

### Employee Credit

- Employee credit is separate from party credit.
- It tracks advances and employee-side payable balances.

### Vehicle Master

- Vehicle records are used for lookup and capacity defaults.
- Vehicle ownership/party association should eventually use IDs, not only free text.

### Material Master

- Material rates drive defaults for new sales.
- Material updates affect future entries only.

### Suppliers

- Supplier master is planned but not implemented.
- Supplier usage should be introduced later with purchases and day book.

### Day Book

- Day book is a future ledger layer.
- It should receive entries from sales, purchases, credits, and adjustments once implemented.

### Audit

- Important mutations should be logged.
- Audit logging should capture who/what/when/old/new values once authentication exists.
- Audit infrastructure may exist before full auth, but audit semantics remain lightweight until later phases.

### Roles

- Roles are planned but not active in the UI yet.
- Authentication and authorization are deferred.

### Dashboard

- Owner dashboard is a later-phase read model.
- It should summarize sales, purchases, outstanding credit, and operational totals.

### Offline-First Rules

- Local SQLite remains the source of truth for now.
- No sync layer yet.
- No Electron packaging yet.

## Known Current Mismatches

| Module | Current | Required | Priority |
| --- | --- | --- | --- |
| Sales payment model | Stores `cashPaid` and `bankPaid` only | Must support cash, bank, and GPay split payments | High |
| Sales edit control | No password gate | Edit password `1177` required | High |
| Sales credit logic | Creates party credit from final amount, but not from explicit remaining balance workflow | Remaining unpaid balance must be the credit source of truth | High |
| Vehicle quantity logic | Vehicle capacity is stored but not used as a hard workflow rule | Auto-fill quantity from vehicle capacity rules | High |
| Vehicle trip counting | Not implemented | Trip count must be tracked in sales workflow | High |
| FK usage | Legacy text names still drive most writes | IDs should become canonical for normalized tables | High |
| Audit logging | No audit records on mutations | Log key creates/updates/deletes | High |
| Day book | Not implemented | Post entries from sales/purchases/adjustments | High |
| Supplier master | Schema prepared, UI/workflow absent | Use as source master for purchase flow later | Medium |
| Dashboard | Not implemented | Aggregate operational view for owner | Medium |
| README assumptions | Refers to PostgreSQL, NextAuth, and a broader web app scope | Phase 1 path is offline SQLite-first MBM ERP | Medium |

## Phase Ordering

1. Sales rewrite.
2. Purchases normalization.
3. Day book.
4. Credit and collections.
5. Owner dashboard.
6. Sync.
7. Desktop packaging.
