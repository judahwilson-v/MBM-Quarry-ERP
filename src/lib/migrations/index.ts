import type { Migration } from "./runner";

// Import all migration definitions in order
import baseline from "./definitions/001_baseline";
import repairWeighbridge from "./definitions/002_repair_weighbridge_columns";
import legacyColumns from "./definitions/003_ensure_legacy_columns";
import backfillTimestamps from "./definitions/004_backfill_timestamps";
import outboxFoundation from "./definitions/005_outbox_foundation";

// ---------------------------------------------------------------------------
// Migration Registry
// ---------------------------------------------------------------------------
// ALL migrations are registered here in version order.
// When adding a new migration:
//   1. Create a new file in definitions/ with the next version number
//   2. Import it here
//   3. Add it to the ALL_MIGRATIONS array
//
// NEVER remove or reorder existing migrations.
// NEVER change the SQL body of an already-deployed migration.
// ---------------------------------------------------------------------------

export const ALL_MIGRATIONS: Migration[] = [
  baseline,           // v1: Create all 32 model tables + indexes
  repairWeighbridge,  // v2: Fix weighbridge_tickets ticketType → ticket_type
  legacyColumns,      // v3: Add all columns from ensureSQLiteColumn + migrate.js
  backfillTimestamps, // v4: Set NULL updated_at to CURRENT_TIMESTAMP
  outboxFoundation,   // v5: Add device identity and durable outbox
];

export { runMigrations } from "./runner";
export type { Migration } from "./runner";
