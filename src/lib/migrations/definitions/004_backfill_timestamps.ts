import type { PrismaClient } from "@prisma/client";
import type { Migration } from "../runner";

// ---------------------------------------------------------------------------
// Migration 004: Backfill NULL timestamps
// ---------------------------------------------------------------------------
// Absorbs the backfillSQLiteTimestamp() calls from bootstrap.ts.
// Sets updated_at = CURRENT_TIMESTAMP where it is NULL, which happens
// when the column was added by a previous ensureSQLiteColumn/migration
// without a DEFAULT value on existing rows.
// ---------------------------------------------------------------------------

const TABLES_TO_BACKFILL = [
  "vehicles",
  "parties",
  "outgoing_sales",
  "incoming_boulder",
  "party_credit",
  "employee_credit",
  "other_credits",
];

const migration: Migration = {
  version: 4,
  id: "004_backfill_timestamps",
  description: "Backfill NULL updated_at values in legacy rows",

  up: async (_prisma: PrismaClient): Promise<string[]> => {
    return TABLES_TO_BACKFILL.map(
      (table) =>
        `UPDATE "${table}" SET "updated_at" = CURRENT_TIMESTAMP WHERE "updated_at" IS NULL`
    );
  },
};

export default migration;
