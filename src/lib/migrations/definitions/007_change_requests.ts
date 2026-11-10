import type { PrismaClient } from "@prisma/client";
import type { Migration } from "../runner";

// Edit/delete request-approval trail. Additive and LOCAL-ONLY by design:
// change_requests is excluded from sync-map and the generated remote schema,
// exactly like the identity tables. Rows are append-only history; decided
// requests are never rewritten.
const migration: Migration = {
  version: 7,
  id: "007_change_requests",
  description: "Add local-only edit/delete change request trail",
  up: async (_prisma: PrismaClient): Promise<string[]> => [
    `CREATE TABLE IF NOT EXISTS "change_requests" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "idempotency_key" TEXT NOT NULL,
      "entity_name" TEXT NOT NULL,
      "entity_id" TEXT NOT NULL,
      "operation" TEXT NOT NULL,
      "original_value" TEXT,
      "proposed_value" TEXT,
      "reason" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "requested_by_id" TEXT,
      "requested_by_name" TEXT NOT NULL,
      "decided_by_id" TEXT,
      "decided_by_name" TEXT,
      "decision_note" TEXT,
      "applied_audit_id" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "decided_at" DATETIME,
      "applied_at" DATETIME
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "change_requests_idempotency_key_key" ON "change_requests"("idempotency_key")`,
    `CREATE INDEX IF NOT EXISTS "change_requests_entity_name_entity_id_idx" ON "change_requests"("entity_name", "entity_id")`,
    `CREATE INDEX IF NOT EXISTS "change_requests_status_idx" ON "change_requests"("status")`,
  ],
};

export default migration;
