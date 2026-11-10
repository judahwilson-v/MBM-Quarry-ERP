import type { PrismaClient } from "@prisma/client";
import type { Migration } from "../runner";

// Worker identity foundation. Additive and LOCAL-ONLY by design: app_users,
// auth_sessions and app_meta are deliberately excluded from sync-map and the
// generated remote schema. Credentials (scrypt hashes/salts) and sessions
// must never leave the device through generic entity sync.
const migration: Migration = {
  version: 6,
  id: "006_worker_identity",
  description: "Add local-only worker identity, auth sessions and app meta",
  up: async (_prisma: PrismaClient): Promise<string[]> => [
    `CREATE TABLE IF NOT EXISTS "app_users" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "pin_hash" TEXT NOT NULL,
      "pin_salt" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'worker',
      "active" BOOLEAN NOT NULL DEFAULT true,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "app_users_name_key" ON "app_users"("name")`,
    `CREATE TABLE IF NOT EXISTS "auth_sessions" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "user_id" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expires_at" DATETIME NOT NULL,
      CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "auth_sessions_token_key" ON "auth_sessions"("token")`,
    `CREATE INDEX IF NOT EXISTS "auth_sessions_user_id_idx" ON "auth_sessions"("user_id")`,
    `CREATE TABLE IF NOT EXISTS "app_meta" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "value" TEXT NOT NULL
    )`,
  ],
};

export default migration;
