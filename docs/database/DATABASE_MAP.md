# DATABASE MAP

## Architecture
The application uses **SQLite** for local, offline-first data storage and **Prisma** as the ORM to interact with the database. **Supabase** acts as the cloud source of truth.

---

## Critical Rules ("Never Change")
1. **Never reset databases or delete migrations.**
2. **Never recreate schemas.**
3. **Never rename Prisma models or database columns.**
4. **Never modify IDs or change relations.** *(Unless explicitly instructed and approved by the user).*
5. **Always preserve existing user data.**
6. **Prefer additive migrations.** Backward compatibility is mandatory.

---

## SQLite Pathing (Production vs Dev)
* **Development**: The database is located at `prisma/dev.db`.
* **Production (Electron)**: The database is located in the user's `%APPDATA%` folder (`C:\Users\<User>\AppData\Roaming\<App>\quarry.db`).
* **Crucial Packaging Logic**: The packaged Electron app ships with a pristine `local.db` inside its `resources/standalone/prisma` folder. If `%APPDATA%\quarry.db` does not exist (or gets corrupted), the app copies `local.db` into `%APPDATA%` to initialize or Factory Reset the app.

---

## Migration & Sync Strategy
Because this is an offline desktop app distributed via `.exe`, running standard `prisma migrate deploy` on the client machine is difficult.
* Schema changes must be carefully managed.
* Schema mismatches between the compiled Next.js standalone app and the user's local `quarry.db` will cause a fatal 500 error on boot.
* **Sync Engine**: Local SQLite handles all immediate reads/writes for speed and offline capability. The sync engine pushes operations to the remote Supabase cloud and pulls updates down, resolving conflicts gracefully.

---

## SQLite Schema Reference (Mapped Tables)

All database tables follow a `snake_case` naming convention, while the Prisma ORM models use `PascalCase`. The exact table names are explicitly mapped in the database.

### Table: `vehicles`
Stores transport vehicles used for trips/sales.
- `id` (String, PK) - `cuid()`
- `vehicle_number` (String, Unique)
- `party_id` (String, Nullable FK to `parties.id`)
- `party_name` (String, Nullable)
- `company_body_qty` (Float, Nullable)
- `extra_body_qty` (Float, Nullable)
- `trip_count` (Int, Default `0`)
- `created_at` (DateTime, Default `now()`)
- `updated_at` (DateTime, Auto-updated)
*Relationships*: Belongs to `parties` (via `party_id`, `ON DELETE SET NULL`), has many `outgoing_sales`, `incoming_boulder`, `expenses`.

### Table: `parties`
Stores customers and suppliers.
- `id` (String, PK) - `cuid()`
- `party_name` (String, Unique)
- `phone` (String, Nullable)
- `address` (String, Nullable)
- `created_at` (DateTime)
- `updated_at` (DateTime)

### Table: `materials`
Defines materials and default rates.
- `id` (String, PK) - `cuid()`
- `material_name` (String, Unique)
- `rate_per_cft` (Float, Default `0`)
- `created_at` (DateTime)
- `updated_at` (DateTime)

### Table: `outgoing_sales`
Records sales of material to customers.
- `id` (String, PK)
- `sale_date` (DateTime)
- `serial_number` (Int, Unique)
- `book_number` (Int, Nullable)
- `page_number` (Int, Nullable)
- `vehicle_id` (String, Nullable FK)
- `party_id` (String, Nullable FK)
- `material_id` (String, Nullable FK)
- `vehicle_number` (String)
- `party_name` (String)
- `material_name` (String)
- `rate_per_cft` (Float)
- `qty` (Float)
- `original_qty` (Float, Nullable)
- `quantity_reason` (String, Nullable)
- `trip_delta` (Int, Default `1`)
- `discount_type` (String, Default `"fixed"`)
- `discount_value` (Float, Default `0`)
- `amount` (Float)
- `gst_enabled` (Boolean, Default `false`)
- `gst_rate` (Float, Default `5`)
- `sgst` (Float, Default `0`)
- `cgst` (Float, Default `0`)
- `gst_amount` (Float, Default `0`)
- `final_amount` (Float)
- `cash_paid` (Float, Default `0`)
- `bank_paid` (Float, Default `0`)
- `gpay_paid` (Float, Default `0`)
- `paid_total` (Float, Default `0`)
- `remaining_credit` (Float, Default `0`)
- `remarks` (String, Nullable)
- `created_at` (DateTime)
- `updated_at` (DateTime)

### Table: `incoming_boulder`
Records purchases of raw boulder materials from suppliers.
- `id` (String, PK)
- `date` (DateTime)
- `vehicle_id` (String, Nullable FK)
- `party_id` (String, Nullable FK)
- `material_id` (String, Nullable FK)
- `vehicle_number` (String)
- `party_name` (String)
- `material_name` (String, Default `"ROCK"`)
- `qty` (Float)
- `remarks` (String, Nullable)
- `time` (String, Nullable)
- `rock_rate` (Float, Default `26`)
- `amount` (Float, Default `0`)
- `cash_paid` (Float, Default `0`)
- `bank_paid` (Float, Default `0`)
- `gpay_paid` (Float, Default `0`)
- `paid_total` (Float, Default `0`)
- `remaining_credit` (Float, Default `0`)
- `settled` (Boolean, Default `false`)
- `vehicle_rent` (Float, Default `0`)
- `combined_payment` (Boolean, Default `false`)
- `created_at` (DateTime)
- `updated_at` (DateTime)

### Table: `financial_events`
Event-sourced system table recording financial transitions.
- `id` (String, PK)
- `event_id` (String, Unique UUID)
- `correlation_id` (String)
- `event_type` (String)
- `entity_type` (String)
- `entity_id` (String)
- `schema_version` (Int, Default `1`)
- `payload` (Json)
- `created_at` (DateTime)

### Table: `ledger_entries`
Individual financial ledger actions derived from events.
- `id` (String, PK)
- `financial_event_id` (String, Unique)
- `correlation_id` (String)
- `event_type` (String)
- `entity_type` (String)
- `entity_id` (String)
- `entry_date` (DateTime)
- `cash_amount` (Float, Default `0`)
- `bank_amount` (Float, Default `0`)
- `gpay_amount` (Float, Default `0`)
- `credit_amount` (Float, Default `0`)
- `total_amount` (Float, Default `0`)
- `created_at` (DateTime)

### Table: `day_books`
High-level aggregated daily cash and bank summary.
- `id` (String, PK)
- `business_date` (DateTime, Unique)
- `opening_cash_balance` (Float, Default `0`)
- `opening_bank_balance` (Float, Default `0`)
- `cash_sales_total` (Float, Default `0`)
- `bank_sales_total` (Float, Default `0`)
- `gpay_sales_total` (Float, Default `0`)
- `expense_total` (Float, Default `0`)
- `closing_cash_balance` (Float, Default `0`)
- `closing_bank_balance` (Float, Default `0`)
- `created_at` (DateTime)
- `updated_at` (DateTime)

### Table: `day_book_expense_entries`
Sub-entries for expenses linked to a specific Day Book record.
- `id` (String, PK)
- `day_book_id` (String, FK to `day_books.id` ON DELETE CASCADE)
- `source_event_id` (String, Unique)
- `expense_type` (String)
- `entry_date` (DateTime)
- `amount` (Float)
- `description` (String, Nullable)
- `created_at` (DateTime)

### Table: `party_credit`
Links between parties and credit balances for specific sales.
- `id` (String, PK)
- `party_id` (String, Nullable FK)
- `party_name` (String)
- `sale_id` (String, FK to `outgoing_sales.id` ON DELETE CASCADE)
- `amount` (Float)
- `status` (String, Default `"pending"`)
- `created_at` (DateTime)
- `updated_at` (DateTime)

### Table: `party_collections`
Payments received from customers.
- `id` (String, PK)
- `party_id` (String, Nullable FK)
- `party_name` (String)
- `collection_date` (DateTime)
- `cash_paid` (Float, Default `0`)
- `bank_paid` (Float, Default `0`)
- `gpay_paid` (Float, Default `0`)
- `total_amount` (Float)
- `remarks` (String, Nullable)
- `source_event_id` (String, Unique)
- `created_at` (DateTime)
- `updated_at` (DateTime)

### Table: `party_ledger`
Derived table calculating continuous running balances for parties.
- `id` (String, PK)
- `party_id` (String, Nullable FK)
- `party_name` (String)
- `date` (DateTime)
- `time` (String, Nullable)
- `type` (String)
- `ref_id` (String)
- `description` (String)
- `payment_method` (String, Nullable)
- `debit_amount` (Float, Default `0`)
- `credit_amount` (Float, Default `0`)
- `balance` (Float, Default `0`)
- `created_at` (DateTime)

### Table: `party_payments`
Payments given out to suppliers.
- `id` (String, PK)
- `party_id` (String, Nullable FK)
- `party_name` (String)
- `payment_date` (DateTime)
- `cash_paid` (Float, Default `0`)
- `bank_paid` (Float, Default `0`)
- `gpay_paid` (Float, Default `0`)
- `total_amount` (Float)
- `remarks` (String, Nullable)
- `source_event_id` (String, Unique)
- `created_at` (DateTime)
- `updated_at` (DateTime)

### Table: `expenses`
Direct general operational expense tracking.
- `id` (String, PK)
- `expense_date` (DateTime)
- `expense_type` (String)
- `amount` (Float)
- `payment_mode` (String, Default `"CASH"`)
- `party_id` (String, Nullable FK)
- `party_name` (String, Nullable)
- `vehicle_id` (String, Nullable FK)
- `vehicle_number` (String, Nullable)
- `description` (String, Nullable)
- `source_event_id` (String, Unique)
- `created_at` (DateTime)
- `updated_at` (DateTime)

### Table: `sync_state`
Stores the background sync status to Supabase cloud.
- `id` (String, PK, Default `"default"`)
- `last_synced_at` (DateTime, Default `'1970-01-01 00:00:00'`)
- `status` (String, Default `"IDLE"`)
- `last_error` (String, Nullable)
- `updated_at` (DateTime)

### Table: `global_settings`
Configures global variables for the instance.
- `id` (String, PK, Default `"default"`)
- `quarry_name` (String, Default `"MBM Quarry"`)
- `gst_number` (String, Default `""`)
- `address` (String, Default `""`)
- `phone` (String, Default `""`)
- `default_printer` (String, Default `""`)
- `backup_folder` (String, Default `""`)
- `admin_pin` (String, Default `"8888"`)
- `delete_pin` (String, Default `"7711"`)
- `enable_weighbridge` (Boolean, Default `false`)
- `enable_fleet_maintenance` (Boolean, Default `false`)
- `enable_customer_portal` (Boolean, Default `false`)
- `enable_credit_locks` (Boolean, Default `false`)
- `updated_at` (DateTime)

### Table: `inventory_stock`
Stores live inventory summary for materials/stock items.
- `id` (String, PK) - `cuid()`
- `material_name` (String, Unique)
- `quantity` (Float, Default `0`)
- `unit` (String, Default `"TONS"`)
- `last_updated` (DateTime, Default `now()`)
*Relationships*: Has many `inventory_transactions`.

### Table: `inventory_transactions`
Records granular material stock modifications and balance adjustments.
- `id` (String, PK) - `cuid()`
- `stock_id` (String, FK to `inventory_stock.id` ON DELETE CASCADE)
- `date` (DateTime, Default `now()`)
- `type` (String) - `'PRODUCTION_IN'`, `'SALE_OUT'`, `'MANUAL_ADJUST'`
- `quantity_change` (Float) - Positive for IN, Negative for OUT
- `reference_id` (String, Nullable) - Ref ID of OutgoingSale or IncomingBoulder
- `description` (String, Nullable)
- `created_at` (DateTime, Default `now()`)

### Table: `weighbridge_tickets`
Records weighbridge gross, tare, and net weights with ticket sequences.
- `id` (String, PK) - `cuid()`
- `ticket_number` (Int, Unique)
- `vehicle_number` (String)
- `vehicle_id` (String, Nullable FK)
- `party_id` (String, Nullable FK)
- `material_id` (String, Nullable FK)
- `ticket_type` (String, Default `"OUTGOING"`) - `"OUTGOING"` (Sale) or `"INCOMING"` (Purchase)
- `status` (String, Default `"FIRST_WEIGHT"`) - `"FIRST_WEIGHT"`, `"SECOND_WEIGHT"`, `"COMPLETED"`, `"VOID"`
- `gross_weight` (Float, Nullable)
- `gross_time` (DateTime, Nullable)
- `tare_weight` (Float, Nullable)
- `tare_time` (DateTime, Nullable)
- `net_weight` (Float, Nullable)
- `linked_sale_id` (String, Unique Nullable)
- `linked_boulder_id` (String, Unique Nullable)
- `remarks` (String, Nullable)
- `created_at` (DateTime, Default `now()`)
- `updated_at` (DateTime)

### Table: `maintenance_records`
Logs servicing and maintenance events executed for fleet vehicles.
- `id` (String, PK) - `cuid()`
- `vehicle_id` (String, FK to `vehicles.id` ON DELETE CASCADE)
- `date` (DateTime)
- `engine_hours` (Float)
- `service_type` (String)
- `description` (String, Nullable)
- `cost` (Float, Default `0`)
- `created_at` (DateTime, Default `now()`)
- `updated_at` (DateTime)

### Table: `maintenance_schedules`
Defines recurring preventative maintenance intervals for vehicles.
- `id` (String, PK) - `cuid()`
- `vehicle_id` (String, FK to `vehicles.id` ON DELETE CASCADE)
- `service_type` (String)
- `interval_hours` (Float, Nullable)
- `interval_days` (Int, Nullable)
- `next_due_hours` (Float, Nullable)
- `next_due_date` (DateTime, Nullable)
- `created_at` (DateTime, Default `now()`)
- `updated_at` (DateTime)

### Table: `vehicle_stats`
Stores aggregated live telematics and operational statistics for vehicles.
- `id` (String, PK) - `cuid()`
- `vehicle_id` (String, Unique FK to `vehicles.id` ON DELETE CASCADE)
- `engine_hours` (Float, Default `0`)
- `created_at` (DateTime, Default `now()`)
- `updated_at` (DateTime)
