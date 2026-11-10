import type { PrismaClient } from "@prisma/client";
import type { Migration } from "../runner";

// FULL57: additive record-context fingerprint for the change-request trail.
// Existing rows keep NULL record_fingerprint and fail closed at approval
// (re-file required); no history is rewritten or backfilled.
// Idempotent like migration 003: a fresh bootstrap DDL already carries the
// column, so check PRAGMA table_info before altering.
const migration: Migration = {
  version: 8,
  id: "008_change_request_fingerprint",
  description: "Add record-context fingerprint column to change requests",
  up: async (prisma: PrismaClient): Promise<string[]> => {
    const cols = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("change_requests")`);
    if (cols.some((c) => c.name === "record_fingerprint")) return [];
    return [`ALTER TABLE "change_requests" ADD COLUMN "record_fingerprint" TEXT`];
  },
};

export default migration;
