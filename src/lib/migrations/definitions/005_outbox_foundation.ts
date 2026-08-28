import type { PrismaClient } from "@prisma/client";
import type { Migration } from "../runner";

// Phase 4: durable local outbox foundation. This migration is intentionally
// additive and has no effect on existing sync behaviour until the pilot uses it.
const migration: Migration = {
  version: 5,
  id: "005_outbox_foundation",
  description: "Add persistent device identity and durable sync outbox",
  up: async (_prisma: PrismaClient): Promise<string[]> => [
    `CREATE TABLE IF NOT EXISTS "device_identity" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
      "device_id" TEXT NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "device_identity_device_id_key" ON "device_identity"("device_id")`,
    `CREATE TABLE IF NOT EXISTS "sync_outbox_events" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "event_id" TEXT NOT NULL,
      "device_id" TEXT NOT NULL,
      "entity_type" TEXT NOT NULL,
      "entity_id" TEXT NOT NULL,
      "operation" TEXT NOT NULL,
      "payload" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "attempts" INTEGER NOT NULL DEFAULT 0,
      "last_error" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "delivered_at" DATETIME
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "sync_outbox_events_event_id_key" ON "sync_outbox_events"("event_id")`,
    `CREATE INDEX IF NOT EXISTS "sync_outbox_events_status_created_at_idx" ON "sync_outbox_events"("status", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "sync_outbox_events_entity_type_entity_id_idx" ON "sync_outbox_events"("entity_type", "entity_id")`,
  ],
};

export default migration;
