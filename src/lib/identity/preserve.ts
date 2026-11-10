import type { PrismaClient } from "@prisma/client";
import identityMigration from "@/lib/migrations/definitions/006_worker_identity";
import { ENROLLMENT_KEY } from "./service";

// Device identity state (app_users, auth_sessions, app_meta) is local-only:
// it is never synced and never pulled from the cloud. Replacing the database
// file (local backup restore, uploaded import, staged cloud restore) would
// otherwise resurrect revoked sessions, re-activate deactivated users, or
// reopen a completed enrollment. These helpers snapshot the CURRENT device's
// identity state and re-apply it onto the replacement database, so the
// replacement keeps exactly the identity state the device had at restore
// time. PIN hashes and session tokens are copied database-to-database on
// this device only; they are never logged, returned, or sent anywhere.

export type IdentitySnapshot = {
  users: {
    id: string; name: string; pinHash: string; pinSalt: string;
    role: string; active: boolean; createdAt: Date; updatedAt: Date;
  }[];
  sessions: { id: string; userId: string; token: string; createdAt: Date; expiresAt: Date }[];
  meta: { key: string; value: string }[];
};

export async function identityTablesPresent(db: PrismaClient): Promise<Set<string>> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('app_users','auth_sessions','app_meta')`
  )) as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

export async function hasIdentityRows(db: PrismaClient): Promise<boolean> {
  const present = await identityTablesPresent(db);
  if (present.has("app_users") && (await db.appUser.count()) > 0) return true;
  if (present.has("auth_sessions") && (await db.authSession.count()) > 0) return true;
  if (present.has("app_meta") && (await db.appMeta.count()) > 0) return true;
  return false;
}

export async function snapshotIdentity(db: PrismaClient): Promise<IdentitySnapshot> {
  const present = await identityTablesPresent(db);
  return {
    users: present.has("app_users") ? await db.appUser.findMany() : [],
    sessions: present.has("auth_sessions") ? await db.authSession.findMany() : [],
    meta: present.has("app_meta") ? await db.appMeta.findMany() : [],
  };
}

export function isEnrolledSnapshot(snapshot: IdentitySnapshot): boolean {
  return snapshot.meta.some((m) => m.key === ENROLLMENT_KEY && m.value === "true");
}

// Creates the identity tables when the target predates migration 006
// (CREATE TABLE IF NOT EXISTS - additive only, never alters other tables).
export async function ensureIdentityTables(db: PrismaClient): Promise<void> {
  for (const statement of await identityMigration.up(db)) {
    await db.$executeRawUnsafe(statement);
  }
}

// Replaces ALL identity state in the target with the snapshot and verifies
// the result by per-table row counts against the snapshot. Any failure throws, so the caller's
// journaled rollback restores the previous database instead of leaving a
// half-preserved identity state.
export async function applyIdentitySnapshot(db: PrismaClient, snapshot: IdentitySnapshot): Promise<void> {
  await ensureIdentityTables(db);
  await db.authSession.deleteMany({});
  await db.appUser.deleteMany({});
  await db.appMeta.deleteMany({});
  for (const user of snapshot.users) {
    await db.appUser.create({
      data: {
        id: user.id, name: user.name, pinHash: user.pinHash, pinSalt: user.pinSalt,
        role: user.role, active: user.active, createdAt: user.createdAt, updatedAt: user.updatedAt,
      },
    });
  }
  for (const session of snapshot.sessions) {
    await db.authSession.create({
      data: { id: session.id, userId: session.userId, token: session.token, createdAt: session.createdAt, expiresAt: session.expiresAt },
    });
  }
  for (const entry of snapshot.meta) {
    await db.appMeta.create({ data: { key: entry.key, value: entry.value } });
  }
  const ok =
    (await db.appUser.count()) === snapshot.users.length &&
    (await db.authSession.count()) === snapshot.sessions.length &&
    (await db.appMeta.count()) === snapshot.meta.length;
  if (!ok) throw new Error("Identity preservation verification failed after restore.");
}
