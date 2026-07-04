# MBM UI Spec

This document defines the intended screen layout, field order, and interaction behavior for the current MBM modules.

It is the source of truth for UI behavior, but it does not authorize redesigns outside the approved phase.

## UI Principles

- Preserve existing routes and overall layout.
- Prefer incremental field and behavior changes over visual redesign.
- Keep form ordering predictable for fast offline data entry.
- Use auto-fill where it reduces entry friction without obscuring user control.

## Sales Screen

### Current Route

- `/sales`
- `/sales/new`

### Intended Field Order

1. Date
2. Vehicle lookup
3. Party name
4. Material lookup
5. Rate
6. Quantity
7. Discount type
8. Discount value
9. Cash paid
10. Bank paid
11. GPay paid
12. Remarks

### Intended Behavior

- Vehicle lookup should support searching and typed entry.
- Selecting a vehicle should auto-fill relevant defaults.
- Selecting a material should auto-fill the rate.
- Quantity may be auto-filled from the vehicle rule.
- Remaining unpaid amount should be visible before save.
- Edit actions must be protected by password `1177`.

## Master Data Screens

- Vehicle master
- Party master
- Material master

### Intended Behavior

- Forms should remain simple and inline.
- Search should remain immediate and local.
- Material rate edits should affect future sales only.

## Boulder Purchase Screen

- Keep the existing purchase register behavior.
- No redesign in Phase 1.0.
- Purchase UI details are deferred until Phase 1.2.

## Credit Screens

- Party credit is a read-oriented summary of sales credit.
- Employee credit remains a separate operational record.
- Tables should remain simple and fast to scan.

## Future UI Requirements

- Dashboard should be summary-first, not form-first.
- Day Book should be ledger-oriented.
- Roles and auth should remain hidden until the relevant phase.
