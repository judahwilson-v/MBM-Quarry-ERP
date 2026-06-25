# MBM Database Spec

This document defines the intended database structure and how the current SQLite schema fits the workflow.

It is the source of truth for table relationships, field semantics, and migration direction.

## Current Core Tables

- `vehicles`
- `parties`
- `materials`
- `outgoing_sales`
- `incoming_boulder`
- `party_credit`
- `employee_credit`

## Prepared Future Tables

- `suppliers`
- `day_book_entries`
- `audit_logs`
- `roles`

## Canonical Reference Strategy

- IDs are the canonical link once a module is normalized.
- Legacy text fields remain during transition for backward compatibility.
- Foreign keys should be introduced where they do not break existing behavior.

## Sales Table Intent

- Keep `vehicle_number`, `party_name`, and `material_name` for compatibility.
- Add and use `vehicle_id`, `party_id`, and `material_id` as the normalized references.
- `sale_date` is the business date.
- `created_at` is the record creation time.
- `updated_at` should reflect edit time.

## Vehicle Table Intent

- `vehicle_number` remains the lookup key visible in the UI.
- `party_id` should eventually represent the owning or associated party when known.
- `party_name` is preserved for transition.
- `company_body_qty` and `extra_body_qty` support quantity defaults.

## Party Credit Intent

- `party_credit` is a derived ledger from sales.
- `sale_id` links credit rows to the originating sale.
- `party_id` should be preferred when the sales workflow is fully normalized.

## Future Tables

### Suppliers

- Planned for purchase workflows.
- Should support normalized references from purchase entries.

### Day Book Entries

- Intended as the accounting ledger layer.
- Should capture operational postings from sales, purchases, and adjustments.

### Audit Logs

- Intended to store entity mutations.
- Should support later addition of actor metadata when auth exists.

### Roles

- Intended for access control.
- Schema-only until authentication is introduced.

## Migration Principles

1. Do not drop legacy columns until all current flows are rewritten.
2. Prefer additive migrations.
3. Preserve SQLite data in place.
4. Normalize one workflow at a time.

## Timestamp Rules

- Use `created_at` for record creation.
- Use `updated_at` for mutable entities.
- Do not mix business dates with system timestamps.

## Derived Fields Policy

For every derived field stored in the database, document:

- Formula
- Source-of-truth fields
- Why it is stored instead of calculated
- When it must be recalculated
- Whether it may ever be edited directly

### `paid_total`

- Formula: `cash_paid + bank_paid + gpay_paid`
- Source of truth: `cash_paid`, `bank_paid`, `gpay_paid`
- Stored because: reporting performance, historical reconciliation
- Recalculate when: any payment component changes
- Directly editable: No

### `remaining_credit`

- Formula: `final_amount - paid_total`
- Source of truth: `final_amount`, `paid_total`
- Stored because: reporting performance, collections views, reconciliation
- Recalculate when: `final_amount` or any payment component changes
- Directly editable: No

### `trip_count`

- Formula: count of committed sales trip deltas for a vehicle
- Source of truth: committed sales rows and their `trip_delta`
- Stored because: quick operational lookup and vehicle-level summaries
- Recalculate when: sale create, update, delete, or rollback affects trip deltas
- Directly editable: No
