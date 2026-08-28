import type { PrismaClient } from "@prisma/client";
import type { Migration } from "../runner";

// ---------------------------------------------------------------------------
// Migration 002: Repair weighbridge_tickets column naming
// ---------------------------------------------------------------------------
// The `weighbridge_tickets` table was originally created with `ticketType`
// (camelCase) but Prisma's @map annotation expects `ticket_type` (snake_case).
//
// This migration detects the actual column state and handles all 4 cases:
//
// State A: ticketType exists, ticket_type does not → RENAME COLUMN
// State B: ticket_type exists, ticketType does not → No action (already correct)
// State C: Both columns exist → Copy data from old to new, leave old in place
//          (SQLite does not support DROP COLUMN in all versions)
// State D: Neither column exists → Table doesn't exist or is broken; skip
//          (should never happen after 001_baseline runs)
//
// INVARIANT: All 65 existing weighbridge_ticket rows must be preserved
// with zero data loss. The ticketType data is the source of truth.
// ---------------------------------------------------------------------------

const migration: Migration = {
  version: 2,
  id: "002_repair_weighbridge_columns",
  description: "Rename weighbridge_tickets.ticketType → ticket_type (handles all column states)",

  up: async (prisma: PrismaClient): Promise<string[]> => {
    // Introspect the actual column state
    const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `PRAGMA table_info(weighbridge_tickets)`
    );

    if (columns.length === 0) {
      // Table doesn't exist at all — State D
      // 001_baseline should have created it with the correct column name.
      // Nothing to do here.
      console.log("[Migration 002] weighbridge_tickets table not found — skipping (baseline will create it)");
      return [];
    }

    const columnNames = columns.map((c) => c.name);
    const hasOld = columnNames.includes("ticketType");
    const hasNew = columnNames.includes("ticket_type");

    if (hasOld && !hasNew) {
      // State A: Only old camelCase column exists → RENAME
      console.log("[Migration 002] State A: Renaming ticketType → ticket_type");
      return [
        `ALTER TABLE weighbridge_tickets RENAME COLUMN "ticketType" TO "ticket_type"`,
      ];
    }

    if (!hasOld && hasNew) {
      // State B: Already has correct snake_case column → No action
      console.log("[Migration 002] State B: ticket_type already exists — no action needed");
      return [];
    }

    if (hasOld && hasNew) {
      // State C: Both columns exist (rare edge case)
      // Copy data from old column into new column where new column is NULL,
      // preserving any data that might already be in the new column.
      console.log("[Migration 002] State C: Both columns exist — merging data from ticketType → ticket_type");
      return [
        `UPDATE weighbridge_tickets SET ticket_type = "ticketType" WHERE ticket_type IS NULL AND "ticketType" IS NOT NULL`,
      ];
    }

    // State D: Neither column exists — broken table state
    // This shouldn't happen after baseline migration, but we log and skip.
    console.log("[Migration 002] State D: Neither ticketType nor ticket_type exists — skipping");
    return [];
  },
};

export default migration;
