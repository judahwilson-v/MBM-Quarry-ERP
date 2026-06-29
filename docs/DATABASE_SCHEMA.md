# MBM ERP Database Schema Documentation

This document describes the exact database schema used by the MBM ERP application, derived directly from the `prisma/schema.prisma` file. It should be used as the single source of truth when interacting with the database.

All database tables follow a snake_case naming convention (e.g., `vehicles`, `outgoing_sales`), while the Prisma ORM models use PascalCase (e.g., `Vehicle`, `OutgoingSale`). The exact table names are explicitly mapped in the database.

---

## Table: `vehicles`
**Purpose**: Stores information about transport vehicles used for trips/sales.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `vehicle_number` | String | Required | - | **Unique**. Vehicle registration plate. |
| `party_id` | String | Nullable | - | **Foreign Key** to `parties.id`. |
| `party_name` | String | Nullable | - | |
| `company_body_qty` | Float | Nullable | - | |
| `extra_body_qty` | Float | Nullable | - | |
| `trip_count` | Int | Required | `0` | |
| `created_at` | DateTime | Required | `now()` | |
| `updated_at` | DateTime | Required | auto-updated | |

**Relationships**:
- Belongs to `parties` (via `party_id`, `ON DELETE SET NULL`)
- Has many `outgoing_sales`
- Has many `incoming_boulder`
- Has many `expenses`

**Indexes**:
- Index on `[party_id]`

---

## Table: `parties`
**Purpose**: Stores information about customers and suppliers (parties).

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `party_name` | String | Required | - | **Unique**. Name of the party. |
| `phone` | String | Nullable | - | |
| `address` | String | Nullable | - | |
| `created_at` | DateTime | Required | `now()` | |
| `updated_at` | DateTime | Required | auto-updated | |

**Relationships**:
- Has many `vehicles`
- Has many `outgoing_sales`
- Has many `incoming_boulder`
- Has many `party_credit`
- Has many `party_collections`
- Has many `party_ledger`
- Has many `party_payments`
- Has many `expenses`

---

## Table: `materials`
**Purpose**: Defines the materials being sold/purchased and their default rates.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `material_name` | String | Required | - | **Unique**. e.g., ROCK. |
| `rate_per_cft` | Float | Required | `0` | |
| `created_at` | DateTime | Required | `now()` | |
| `updated_at` | DateTime | Required | auto-updated | |

**Relationships**:
- Has many `outgoing_sales`
- Has many `incoming_boulder`

---

## Table: `outgoing_sales`
**Purpose**: Records all sales of material to customers.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `sale_date` | DateTime | Required | - | |
| `serial_number` | Int | Required | - | **Unique**. |
| `book_number` | Int | Nullable | - | |
| `page_number` | Int | Nullable | - | |
| `vehicle_id` | String | Nullable | - | **Foreign Key** to `vehicles.id`. |
| `party_id` | String | Nullable | - | **Foreign Key** to `parties.id`. |
| `material_id` | String | Nullable | - | **Foreign Key** to `materials.id`. |
| `vehicle_number` | String | Required | - | |
| `party_name` | String | Required | - | |
| `material_name` | String | Required | - | |
| `rate_per_cft` | Float | Required | - | |
| `qty` | Float | Required | - | |
| `original_qty` | Float | Nullable | - | |
| `quantity_reason` | String | Nullable | - | |
| `trip_delta` | Int | Required | `1` | |
| `discount_type` | String | Required | `"fixed"` | |
| `discount_value` | Float | Required | `0` | |
| `amount` | Float | Required | - | |
| `gst_enabled` | Boolean | Required | `false` | |
| `gst_rate` | Float | Required | `5` | |
| `sgst` | Float | Required | `0` | |
| `cgst` | Float | Required | `0` | |
| `gst_amount` | Float | Required | `0` | |
| `final_amount` | Float | Required | - | |
| `cash_paid` | Float | Required | `0` | |
| `bank_paid` | Float | Required | `0` | |
| `gpay_paid` | Float | Required | `0` | |
| `paid_total` | Float | Required | `0` | |
| `remaining_credit` | Float | Required | `0` | |
| `remarks` | String | Nullable | - | |
| `created_at` | DateTime | Required | `now()` | |
| `updated_at` | DateTime | Required | auto-updated | |

**Relationships**:
- Belongs to `vehicles` (`ON DELETE SET NULL`)
- Belongs to `parties` (`ON DELETE SET NULL`)
- Belongs to `materials` (`ON DELETE SET NULL`)
- Has many `party_credit`

**Indexes**:
- `[sale_date]`
- `[vehicle_id]`
- `[party_id]`
- `[material_id]`

---

## Table: `financial_events`
**Purpose**: Event-sourced system table recording financial transitions.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `event_id` | String | Required | `uuid()` | **Unique**. |
| `correlation_id` | String | Required | - | |
| `event_type` | String | Required | - | |
| `entity_type` | String | Required | - | |
| `entity_id` | String | Required | - | |
| `schema_version` | Int | Required | `1` | |
| `payload` | Json | Required | - | |
| `created_at` | DateTime | Required | `now()` | |

**Indexes**:
- `[correlation_id]`
- `[entity_type, entity_id]`
- `[event_type]`

---

## Table: `ledger_entries`
**Purpose**: System table representing individual financial ledger actions derived from events.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `financial_event_id`| String | Required | - | **Unique**. |
| `correlation_id` | String | Required | - | |
| `event_type` | String | Required | - | |
| `entity_type` | String | Required | - | |
| `entity_id` | String | Required | - | |
| `entry_date` | DateTime | Required | - | |
| `cash_amount` | Float | Required | `0` | |
| `bank_amount` | Float | Required | `0` | |
| `gpay_amount` | Float | Required | `0` | |
| `credit_amount` | Float | Required | `0` | |
| `total_amount` | Float | Required | `0` | |
| `created_at` | DateTime | Required | `now()` | |

**Indexes**:
- `[correlation_id]`
- `[entity_type, entity_id]`
- `[event_type]`

---

## Table: `day_books`
**Purpose**: High-level aggregated daily cash and bank summary.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `business_date` | DateTime | Required | - | **Unique**. Midnight timestamp representing the day. |
| `opening_cash_balance`| Float| Required | `0` | |
| `opening_bank_balance`| Float| Required | `0` | |
| `cash_sales_total` | Float | Required | `0` | |
| `bank_sales_total` | Float | Required | `0` | |
| `gpay_sales_total` | Float | Required | `0` | |
| `expense_total` | Float | Required | `0` | |
| `closing_cash_balance`| Float| Required | `0` | |
| `closing_bank_balance`| Float| Required | `0` | |
| `created_at` | DateTime | Required | `now()` | |
| `updated_at` | DateTime | Required | auto-updated | |

**Relationships**:
- Has many `day_book_expense_entries`

**Indexes**:
- `[business_date]`

---

## Table: `day_book_expense_entries`
**Purpose**: Sub-entries for expenses linked to a specific Day Book record.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `day_book_id` | String | Required | - | **Foreign Key** to `day_books.id`. |
| `source_event_id` | String | Required | - | **Unique**. |
| `expense_type` | String | Required | - | |
| `entry_date` | DateTime | Required | - | |
| `amount` | Float | Required | - | |
| `description` | String | Nullable | - | |
| `created_at` | DateTime | Required | `now()` | |

**Relationships**:
- Belongs to `day_books` (`ON DELETE CASCADE`)

**Indexes**:
- `[day_book_id]`
- `[entry_date]`

---

## Table: `incoming_boulder`
**Purpose**: Records purchases of raw boulder materials from suppliers.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `date` | DateTime | Required | `now()` | |
| `vehicle_id` | String | Nullable | - | **Foreign Key** to `vehicles.id`. |
| `party_id` | String | Nullable | - | **Foreign Key** to `parties.id`. |
| `material_id` | String | Nullable | - | **Foreign Key** to `materials.id`. |
| `vehicle_number` | String | Required | - | |
| `party_name` | String | Required | - | |
| `material_name` | String | Required | `"ROCK"` | |
| `qty` | Float | Required | - | |
| `remarks` | String | Nullable | - | |
| `time` | String | Nullable | - | |
| `rock_rate` | Float | Required | `26` | |
| `amount` | Float | Required | `0` | |
| `cash_paid` | Float | Required | `0` | |
| `bank_paid` | Float | Required | `0` | |
| `gpay_paid` | Float | Required | `0` | |
| `paid_total` | Float | Required | `0` | |
| `remaining_credit` | Float | Required | `0` | |
| `settled` | Boolean | Required | `false` | |
| `vehicle_rent` | Float | Required | `0` | |
| `combined_payment` | Boolean | Required | `false` | |
| `created_at` | DateTime | Required | `now()` | |
| `updated_at` | DateTime | Required | auto-updated | |

**Relationships**:
- Belongs to `vehicles` (`ON DELETE SET NULL`)
- Belongs to `parties` (`ON DELETE SET NULL`)
- Belongs to `materials` (`ON DELETE SET NULL`)

**Indexes**:
- `[date]`
- `[vehicle_id]`
- `[party_id]`
- `[material_id]`

---

## Table: `party_credit`
**Purpose**: Explicit links between parties and credit balances for specific sales.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `party_id` | String | Nullable | - | **Foreign Key** to `parties.id`. |
| `party_name` | String | Required | - | |
| `sale_id` | String | Required | - | **Foreign Key** to `outgoing_sales.id`. |
| `amount` | Float | Required | - | |
| `status` | String | Required | `"pending"` | |
| `created_at` | DateTime | Required | `now()` | |
| `updated_at` | DateTime | Required | auto-updated | |

**Relationships**:
- Belongs to `parties` (`ON DELETE SET NULL`)
- Belongs to `outgoing_sales` (`ON DELETE CASCADE`)

**Indexes**:
- `[party_id]`
- `[party_name]`
- `[sale_id]`

---

## Table: `party_collections`
**Purpose**: Records payments received from customers.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `party_id` | String | Nullable | - | **Foreign Key** to `parties.id`. |
| `party_name` | String | Required | - | |
| `collection_date` | DateTime | Required | - | |
| `cash_paid` | Float | Required | `0` | |
| `bank_paid` | Float | Required | `0` | |
| `gpay_paid` | Float | Required | `0` | |
| `total_amount` | Float | Required | - | |
| `remarks` | String | Nullable | - | |
| `source_event_id` | String | Required | - | **Unique**. |
| `created_at` | DateTime | Required | `now()` | |
| `updated_at` | DateTime | Required | auto-updated | |

**Relationships**:
- Belongs to `parties` (`ON DELETE SET NULL`)

**Indexes**:
- `[party_id]`
- `[party_name]`
- `[collection_date]`

---

## Table: `party_ledger`
**Purpose**: Derived table calculating continuous running balances for parties.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `party_id` | String | Nullable | - | **Foreign Key** to `parties.id`. |
| `party_name` | String | Required | - | |
| `date` | DateTime | Required | - | |
| `time` | String | Nullable | - | |
| `type` | String | Required | - | SALE, PURCHASE, PAYMENT_RECEIVED, PAYMENT_GIVEN, MANUAL_DEBIT, MANUAL_CREDIT |
| `ref_id` | String | Required | - | References ID of original entity |
| `description` | String | Required | - | |
| `payment_method` | String | Nullable | - | |
| `debit_amount` | Float | Required | `0` | (+ Asset or MBM pays Supplier) |
| `credit_amount` | Float | Required | `0` | (+ Liability or Customer pays MBM) |
| `balance` | Float | Required | `0` | Running balance. Positive = Owed to MBM. Negative = MBM Owes. |
| `created_at` | DateTime | Required | `now()` | |

**Relationships**:
- Belongs to `parties` (`ON DELETE SET NULL`)

**Indexes**:
- `[party_id]`
- `[party_name]`
- `[date]`

---

## Table: `cash_transfers`
**Purpose**: Tracks internal movement of money between cash and bank.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `date` | DateTime | Required | - | |
| `time` | String | Required | - | |
| `type` | String | Required | - | CASH_TO_BANK, BANK_TO_CASH |
| `amount` | Float | Required | - | |
| `user_name` | String | Required | - | |
| `remarks` | String | Nullable | - | |
| `created_at` | DateTime | Required | `now()` | |

**Indexes**:
- `[date]`

---

## Table: `party_payments`
**Purpose**: Records payments given out to suppliers.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `party_id` | String | Nullable | - | **Foreign Key** to `parties.id`. |
| `party_name` | String | Required | - | |
| `payment_date` | DateTime | Required | - | |
| `cash_paid` | Float | Required | `0` | |
| `bank_paid` | Float | Required | `0` | |
| `gpay_paid` | Float | Required | `0` | |
| `total_amount` | Float | Required | - | |
| `remarks` | String | Nullable | - | |
| `source_event_id` | String | Required | - | **Unique**. |
| `created_at` | DateTime | Required | `now()` | |
| `updated_at` | DateTime | Required | auto-updated | |

**Relationships**:
- Belongs to `parties` (`ON DELETE SET NULL`)

**Indexes**:
- `[party_id]`
- `[party_name]`
- `[payment_date]`

---

## Table: `employee_credit`
**Purpose**: Records advances/credits given to employees.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `employee_name` | String | Required | - | |
| `amount` | Float | Required | - | |
| `reason` | String | Nullable | - | |
| `expected_due_date`| DateTime | Nullable | - | |
| `status` | String | Required | `"pending"` | |
| `created_at` | DateTime | Required | `now()` | |
| `updated_at` | DateTime | Required | auto-updated | |

---

## Table: `suppliers`
**Purpose**: Separate entity tracking for suppliers (legacy/specific tracking).

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `supplier_name` | String | Required | - | **Unique**. |
| `phone` | String | Nullable | - | |
| `address` | String | Nullable | - | |
| `created_at` | DateTime | Required | `now()` | |
| `updated_at` | DateTime | Required | auto-updated | |

---

## Table: `day_book_entries`
**Purpose**: Flat record system for historical/generic day book entries.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `entry_date` | DateTime | Required | - | |
| `entry_type` | String | Required | - | |
| `reference` | String | Nullable | - | |
| `description` | String | Nullable | - | |
| `debit` | Float | Required | `0` | |
| `credit` | Float | Required | `0` | |
| `created_at` | DateTime | Required | `now()` | |
| `updated_at` | DateTime | Required | auto-updated | |

**Indexes**:
- `[entry_date]`

---

## Table: `audit_logs`
**Purpose**: Records manual edits and deletions for compliance.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `entity_name` | String | Required | - | |
| `entity_id` | String | Required | - | |
| `action` | String | Required | - | |
| `payload` | String | Nullable | - | Stored JSON data |
| `created_at` | DateTime | Required | `now()` | |

**Indexes**:
- `[entity_name, entity_id]`

---

## Table: `roles`
**Purpose**: Defines authorization roles within the system.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `role_name` | String | Required | - | **Unique**. |
| `created_at` | DateTime | Required | `now()` | |
| `updated_at` | DateTime | Required | auto-updated | |

---

## Table: `other_credits`
**Purpose**: General credits not fitting into customer or employee categories.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `name` | String | Required | - | |
| `amount` | Float | Required | - | |
| `reason` | String | Nullable | - | |
| `expected_due_date`| DateTime | Nullable | - | |
| `status` | String | Required | `"pending"` | |
| `created_at` | DateTime | Required | `now()` | |
| `updated_at` | DateTime | Required | auto-updated | |

---

## Table: `expenses`
**Purpose**: Direct general operational expense tracking.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `cuid()` | **Primary Key** |
| `expense_date` | DateTime | Required | - | |
| `expense_type` | String | Required | - | |
| `amount` | Float | Required | - | |
| `payment_mode` | String | Required | `"CASH"` | |
| `party_id` | String | Nullable | - | **Foreign Key** to `parties.id`. |
| `party_name` | String | Nullable | - | |
| `vehicle_id` | String | Nullable | - | **Foreign Key** to `vehicles.id`. |
| `vehicle_number` | String | Nullable | - | |
| `description` | String | Nullable | - | |
| `source_event_id` | String | Required | - | **Unique**. |
| `created_at` | DateTime | Required | `now()` | |
| `updated_at` | DateTime | Required | auto-updated | |

**Relationships**:
- Belongs to `parties` (`ON DELETE SET NULL`)
- Belongs to `vehicles` (`ON DELETE SET NULL`)

**Indexes**:
- `[expense_date]`
- `[party_id]`
- `[vehicle_id]`

---

## Table: `sync_state`
**Purpose**: Stores the background sync status to Supabase cloud.

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `"default"` | **Primary Key** |
| `last_synced_at` | DateTime | Required | `'1970-01-01 00:00:00'` | |
| `status` | String | Required | `"IDLE"` | |
| `last_error` | String | Nullable | - | |
| `updated_at` | DateTime | Required | auto-updated | |

---

## Table: `global_settings`
**Purpose**: Configures global variables for the instance (printing, paths).

| Column | Data Type | Required/Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Required | `"default"` | **Primary Key** |
| `quarry_name` | String | Required | `"MBM Quarry"` | |
| `gst_number` | String | Required | `""` | |
| `address` | String | Required | `""` | |
| `phone` | String | Required | `""` | |
| `default_printer` | String | Required | `""` | |
| `backup_folder` | String | Required | `""` | |
| `updated_at` | DateTime | Required | auto-updated | |
