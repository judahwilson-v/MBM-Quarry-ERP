import type { PrismaClient } from "@prisma/client";
import type { Migration } from "../runner";

// ---------------------------------------------------------------------------
// Migration 003: Ensure all legacy columns exist
// ---------------------------------------------------------------------------
// This migration absorbs ALL the ad-hoc ensureSQLiteColumn() calls from
// bootstrap.ts and the party_ledger columns from scripts/migrate.js into a
// single, versioned migration.
//
// Each ALTER TABLE uses a try/catch pattern because SQLite's
// "ALTER TABLE ADD COLUMN" fails if the column already exists. Since the
// migration runner uses the prisma instance for introspection, we use
// PRAGMA table_info to check before adding.
//
// After this migration is applied, all 53 ensureSQLiteColumn calls and
// the 2 migrate.js additions become redundant.
// ---------------------------------------------------------------------------

interface ColumnSpec {
  table: string;
  column: string;
  definition: string;
}

// Complete inventory from bootstrap.ts + scripts/migrate.js
const LEGACY_COLUMNS: ColumnSpec[] = [
  // global_settings
  { table: "global_settings", column: "admin_pin", definition: "TEXT NOT NULL DEFAULT '8888'" },
  { table: "global_settings", column: "delete_pin", definition: "TEXT NOT NULL DEFAULT '7711'" },
  { table: "global_settings", column: "enable_weighbridge", definition: "BOOLEAN NOT NULL DEFAULT 0" },
  { table: "global_settings", column: "enable_fleet_maintenance", definition: "BOOLEAN NOT NULL DEFAULT 0" },
  { table: "global_settings", column: "enable_customer_portal", definition: "BOOLEAN NOT NULL DEFAULT 0" },
  { table: "global_settings", column: "enable_credit_locks", definition: "BOOLEAN NOT NULL DEFAULT 0" },

  // vehicles
  { table: "vehicles", column: "party_id", definition: "TEXT" },
  { table: "vehicles", column: "trip_count", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "vehicles", column: "updated_at", definition: "DATETIME" },
  { table: "vehicles", column: "vehicle_type", definition: "TEXT" },
  { table: "vehicles", column: "engine_hours", definition: "REAL" },

  // parties
  { table: "parties", column: "updated_at", definition: "DATETIME" },
  { table: "parties", column: "party_group", definition: "TEXT" },

  // outgoing_sales
  { table: "outgoing_sales", column: "vehicle_id", definition: "TEXT" },
  { table: "outgoing_sales", column: "party_id", definition: "TEXT" },
  { table: "outgoing_sales", column: "material_id", definition: "TEXT" },
  { table: "outgoing_sales", column: "original_qty", definition: "REAL" },
  { table: "outgoing_sales", column: "quantity_reason", definition: "TEXT" },
  { table: "outgoing_sales", column: "trip_delta", definition: "INTEGER NOT NULL DEFAULT 1" },
  { table: "outgoing_sales", column: "gpay_paid", definition: "REAL NOT NULL DEFAULT 0" },
  { table: "outgoing_sales", column: "paid_total", definition: "REAL NOT NULL DEFAULT 0" },
  { table: "outgoing_sales", column: "remaining_credit", definition: "REAL NOT NULL DEFAULT 0" },
  { table: "outgoing_sales", column: "book_number", definition: "INTEGER" },
  { table: "outgoing_sales", column: "page_number", definition: "INTEGER" },
  { table: "outgoing_sales", column: "updated_at", definition: "DATETIME" },
  { table: "outgoing_sales", column: "gst_enabled", definition: "BOOLEAN NOT NULL DEFAULT false" },
  { table: "outgoing_sales", column: "gst_rate", definition: "REAL NOT NULL DEFAULT 5" },
  { table: "outgoing_sales", column: "sgst", definition: "REAL NOT NULL DEFAULT 0" },
  { table: "outgoing_sales", column: "cgst", definition: "REAL NOT NULL DEFAULT 0" },
  { table: "outgoing_sales", column: "gst_amount", definition: "REAL NOT NULL DEFAULT 0" },
  { table: "outgoing_sales", column: "discount_type", definition: "TEXT NOT NULL DEFAULT 'fixed'" },
  { table: "outgoing_sales", column: "discount_value", definition: "REAL NOT NULL DEFAULT 0" },

  // incoming_boulder
  { table: "incoming_boulder", column: "vehicle_id", definition: "TEXT" },
  { table: "incoming_boulder", column: "party_id", definition: "TEXT" },
  { table: "incoming_boulder", column: "material_id", definition: "TEXT" },
  { table: "incoming_boulder", column: "time", definition: "TEXT" },
  { table: "incoming_boulder", column: "rock_rate", definition: "REAL NOT NULL DEFAULT 26" },
  { table: "incoming_boulder", column: "amount", definition: "REAL NOT NULL DEFAULT 0" },
  { table: "incoming_boulder", column: "cash_paid", definition: "REAL NOT NULL DEFAULT 0" },
  { table: "incoming_boulder", column: "bank_paid", definition: "REAL NOT NULL DEFAULT 0" },
  { table: "incoming_boulder", column: "gpay_paid", definition: "REAL NOT NULL DEFAULT 0" },
  { table: "incoming_boulder", column: "paid_total", definition: "REAL NOT NULL DEFAULT 0" },
  { table: "incoming_boulder", column: "remaining_credit", definition: "REAL NOT NULL DEFAULT 0" },
  { table: "incoming_boulder", column: "settled", definition: "BOOLEAN NOT NULL DEFAULT false" },
  { table: "incoming_boulder", column: "vehicle_rent", definition: "REAL NOT NULL DEFAULT 0" },
  { table: "incoming_boulder", column: "combined_payment", definition: "BOOLEAN NOT NULL DEFAULT false" },
  { table: "incoming_boulder", column: "updated_at", definition: "DATETIME" },
  { table: "incoming_boulder", column: "book_number", definition: "INTEGER" },
  { table: "incoming_boulder", column: "page_number", definition: "INTEGER" },

  // party_credit
  { table: "party_credit", column: "party_id", definition: "TEXT" },
  { table: "party_credit", column: "updated_at", definition: "DATETIME" },

  // employee_credit
  { table: "employee_credit", column: "updated_at", definition: "DATETIME" },

  // other_credits
  { table: "other_credits", column: "updated_at", definition: "DATETIME" },

  // party_ledger (from scripts/migrate.js)
  { table: "party_ledger", column: "time", definition: "TEXT" },
  { table: "party_ledger", column: "payment_method", definition: "TEXT" },
];

const migration: Migration = {
  version: 3,
  id: "003_ensure_legacy_columns",
  description: "Add all legacy columns that were previously applied by ensureSQLiteColumn and migrate.js",

  up: async (prisma: PrismaClient): Promise<string[]> => {
    const statements: string[] = [];

    // Cache column lists per table to avoid repeated PRAGMA calls
    const columnCache = new Map<string, Set<string>>();

    for (const spec of LEGACY_COLUMNS) {
      let existingCols = columnCache.get(spec.table);
      if (!existingCols) {
        const cols = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
          `PRAGMA table_info("${spec.table}")`
        );
        existingCols = new Set(cols.map((c) => c.name));
        columnCache.set(spec.table, existingCols);
      }

      if (!existingCols.has(spec.column)) {
        statements.push(
          `ALTER TABLE "${spec.table}" ADD COLUMN "${spec.column}" ${spec.definition}`
        );
        // Update the cache so subsequent checks for the same table are correct
        existingCols.add(spec.column);
      }
    }

    return statements;
  },
};

export default migration;
