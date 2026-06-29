# Database

MBM uses Prisma with SQLite. The current schema keeps the working modules intact and introduces normalized columns and future tables for Phase 1.0.

## Existing Core Tables

- `vehicles`
- `parties`
- `materials`
- `outgoing_sales`
- `incoming_boulder`
- `party_credit`
- `employee_credit`

## Normalization Added

- Optional foreign-key columns were added for parties, vehicles, and materials where applicable.
- `updated_at` fields were added for timestamp consistency.
- Existing text columns were retained so current screens and historical data continue working.

## Prepared Future Tables

- `suppliers`
- `day_book_entries`
- `audit_logs`
- `roles`

## Migration Notes

- A SQLite migration was added for the schema changes.
- The local database was updated in place so the app can build and run against the normalized structure.
