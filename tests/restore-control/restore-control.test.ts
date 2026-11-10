// Restore/control-plane acceptance suite (FULL55).
// PIN fixture policy: every PIN below is generated at random per run
// (crypto-based), never a real or reused credential, and never logged.
import { describe, it, expect, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Fault-injection hook (FULL58): a one-shot failure of the durable-barrier
// finalize proves the restore rolls back and releases its intent marker
// instead of leaving a swapped database unguarded. Everything else delegates
// to the real module so barrier state stays consistent process-wide.
// Fault-injection hook (FULL59): a one-shot failure of the stage->active move
// inside stagedRestoreFromSupabase proves the rollback releases OUR intent
// marker and restores the original database byte-identically.
vi.mock("@/lib/sync/restore-files", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    moveDatabaseFiles: (from: string, to: string) => {
      if ((globalThis as any).__failStageMoveTo && to === (globalThis as any).__failStageMoveTo) {
        (globalThis as any).__failStageMoveTo = null;
        throw new Error("injected swap fault");
      }
      return actual.moveDatabaseFiles(from, to);
    },
  };
});

vi.mock("@/lib/sync/restore-state", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    finalizeRestartIntent: (token: string, reason?: string) => {
      if ((globalThis as any).__forceFinalizeFault) {
        (globalThis as any).__forceFinalizeFault = false;
        throw new Error("injected finalize fault");
      }
      return actual.finalizeRestartIntent(token, reason);
    },
  };
});
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { createLocalBackup, listLocalBackups, restoreLocalBackup } from "@/app/actions/database";
import { forceSync, getDatabaseInfo, getSupabaseStorageUsage, triggerSupabaseDataPurge } from "@/app/actions/admin";
import { checkRestoreEligibility, performFullRestore, fetchRestoreDiffSummary, fetchDetailedTableDiff } from "@/app/actions/sync";
import { resolveActor } from "@/app/actions/auth";
import { hashPin, newSessionToken, ENROLLMENT_KEY, CONTROL_PRINCIPAL_KEY } from "@/lib/identity/service";
import { ensureIdentityTables } from "@/lib/identity/preserve";
import { clearRestartRequiredForProcessStart } from "@/lib/sync/restore-state";
import { stagedRestoreFromSupabase } from "@/lib/sync/staged-restore";

const genPin = () => crypto.randomInt(100000, 999999).toString();
const RUN = crypto.randomBytes(3).toString("hex");
const fixturePath = (process.env.DATABASE_URL || "").replace(/^file:/, "");
const backupsDir = path.join(path.dirname(fixturePath), "backups");
const sha256 = (p: string) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

let prisma = new PrismaClient();

function freshClient() { return new PrismaClient(); }

async function makeSession(userId: string): Promise<string> {
  const token = newSessionToken();
  await prisma.authSession.create({ data: { userId, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
  return token;
}

describe("unenrolled install (setup compatibility mode)", () => {
  it("allows control operations in development/test compatibility mode", async () => {
    const list = await listLocalBackups(null);
    expect(Array.isArray(list)).toBe(true);
    const created = await createLocalBackup(null);
    expect(created.success).toBe(true);
    expect(created.message).toMatch(/Backup created: (.+\.bak)/);
  });

  it("restores a backup without identity rows while unenrolled", async () => {
    const name = fs.readdirSync(backupsDir).filter((f) => f.endsWith(".bak")).sort().pop()!;
    const result = await restoreLocalBackup(name, null);
    expect(result.success).toBe(true);
    clearRestartRequiredForProcessStart();
  });

  it("refuses control operations in a production build without enrollment", async () => {
    const savedEnv = { NODE_ENV: process.env.NODE_ENV, MBM_TEST_ROOT: process.env.MBM_TEST_ROOT };
    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      delete process.env.MBM_TEST_ROOT;
      const result = await createLocalBackup(null);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/enrollment is not configured/i);
      const restore = await restoreLocalBackup("any.bak", null);
      expect(restore.success).toBe(false);
      expect(restore.message).toMatch(/enrollment is not configured/i);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = savedEnv.NODE_ENV;
      if (savedEnv.MBM_TEST_ROOT === undefined) delete process.env.MBM_TEST_ROOT;
      else process.env.MBM_TEST_ROOT = savedEnv.MBM_TEST_ROOT;
    }
  });

  it("refuses to restore a backup that carries identity rows, leaving the active database untouched", async () => {
    // Craft a valid backup image that contains login data (users + enrollment).
    const craftPath = path.join(path.dirname(fixturePath), `craft-${RUN}.db`);
    const craft = new PrismaClient({ datasources: { db: { url: `file:${craftPath}` } } });
    try {
      await ensureIdentityTables(craft);
      const { hash, salt } = hashPin(genPin());
      await craft.appUser.create({ data: { name: `Ghost-${RUN}`, pinHash: hash, pinSalt: salt } });
      await craft.appMeta.create({ data: { key: ENROLLMENT_KEY, value: "true" } });
    } finally {
      await craft.$disconnect();
    }
    fs.mkdirSync(backupsDir, { recursive: true });
    fs.copyFileSync(craftPath, path.join(backupsDir, "identity-craft.bak"));

    const before = sha256(fixturePath);
    const result = await restoreLocalBackup("identity-craft.bak", null);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/refused/i);
    expect(result.message).toMatch(/login data|enrollment/i);
    expect(sha256(fixturePath)).toBe(before);
    expect(await prisma.appUser.count()).toBe(0);
  });
});

describe("enrolled install: control gate", () => {
  let adminId = "";
  let workerId = "";
  let adminToken = "";
  let workerToken = "";
  let workerToken2 = "";
  let identityBackupName = "";

  it("seeds enrollment with a configured control principal", async () => {
    const { hash, salt } = hashPin(genPin());
    const admin = await prisma.appUser.create({ data: { name: `Owner-${RUN}`, pinHash: hash, pinSalt: salt, role: "owner" } });
    const worker = await prisma.appUser.create({ data: { name: `Worker-${RUN}`, pinHash: hash, pinSalt: salt } });
    await prisma.appMeta.create({ data: { key: ENROLLMENT_KEY, value: "true" } });
    await prisma.appMeta.create({ data: { key: CONTROL_PRINCIPAL_KEY, value: admin.id } });
    adminId = admin.id;
    workerId = worker.id;
    adminToken = await makeSession(adminId);
    workerToken = await makeSession(workerId);
    workerToken2 = await makeSession(workerId);
    expect(adminToken).not.toBe(workerToken);
  });

  it("refuses every gated control entrypoint without a session token", async () => {
    for (const call of [
      () => createLocalBackup(null),
      () => restoreLocalBackup("x.bak", null),
      () => forceSync(null),
      () => getDatabaseInfo(null),
      () => getSupabaseStorageUsage(null),
      () => triggerSupabaseDataPurge(null),
    ]) {
      const result = (await call()) as any;
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/valid login session is required/i);
    }
    expect(await listLocalBackups(null)).toEqual([]);
    await expect(checkRestoreEligibility(null)).rejects.toThrow(/valid login session is required/i);
    await expect(fetchRestoreDiffSummary(null)).rejects.toThrow(/valid login session is required/i);
    await expect(fetchDetailedTableDiff("outgoing_sales", null)).rejects.toThrow(/valid login session is required/i);
    const restore = await performFullRestore(undefined, null);
    expect(restore.success).toBe(false);
    expect(restore.errors[0].error).toMatch(/valid login session is required/i);
  });

  it("refuses an ordinary worker session even though it is authenticated", async () => {
    const result = await createLocalBackup(workerToken);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not configured for this login|Owner-authorized setup is required/i);
    const info = await getDatabaseInfo(workerToken);
    expect(info.success).toBe(false);
    const restore = await restoreLocalBackup("x.bak", workerToken);
    expect(restore.success).toBe(false);
    await expect(checkRestoreEligibility(workerToken)).rejects.toThrow(/not configured for this login|Owner-authorized/i);
  });

  it("allows the configured control principal", async () => {
    const created = await createLocalBackup(adminToken);
    expect(created.success).toBe(true);
    const match = created.message.match(/Backup created: (.+\.bak)/);
    expect(match).toBeTruthy();
    identityBackupName = match![1];
    const info = await getDatabaseInfo(adminToken);
    expect(info.success).toBe(true);
    expect(typeof info.data!.salesCount).toBe("number");
  });

  it("local restore preserves current device identity: revoked sessions stay revoked, deactivation survives", async () => {
    // The backup taken above contains: worker ACTIVE, workerToken2 session valid.
    // Revoke and deactivate AFTER the backup, then restore it.
    await prisma.authSession.deleteMany({ where: { token: workerToken2 } });
    await prisma.appUser.update({ where: { id: workerId }, data: { active: false } });

    const result = await restoreLocalBackup(identityBackupName, adminToken);
    expect(result.success).toBe(true);
    // The restore requires an application restart; simulate that process start.
    clearRestartRequiredForProcessStart();

    const check = freshClient();
    try {
      const worker = await check.appUser.findUnique({ where: { id: workerId } });
      expect(worker).toBeTruthy();
      expect(worker!.active).toBe(false); // deactivation NOT rolled back by the older backup
      const resurrected = await check.authSession.findUnique({ where: { token: workerToken2 } });
      expect(resurrected).toBeNull(); // revoked session NOT resurrected
      const adminSession = await check.authSession.findUnique({ where: { token: adminToken } });
      expect(adminSession).toBeTruthy(); // current session preserved
      const enrolled = await check.appMeta.findUnique({ where: { key: ENROLLMENT_KEY } });
      expect(enrolled?.value).toBe("true"); // enrollment NOT reopened
      const principal = await check.appMeta.findUnique({ where: { key: CONTROL_PRINCIPAL_KEY } });
      expect(principal?.value).toBe(adminId);
    } finally {
      await check.$disconnect();
    }

    // Server-side resolution agrees after the simulated restart.
    const actor = await resolveActor(adminToken);
    expect(actor?.id).toBe(adminId);
    expect(await resolveActor(workerToken)).toBeNull(); // worker deactivated: session no longer resolves
    expect(await resolveActor(workerToken2)).toBeNull();
  });
});

describe("enrolled install: staged cloud restore carries device identity", () => {
  it("carries users, sessions and enrollment into the staged replacement", async () => {
    // Work on an isolated copy so the shared fixture stays usable.
    const cloudPath = path.join(path.dirname(fixturePath), `cloud-${RUN}.db`);
    const checkpoint = freshClient();
    try {
      await checkpoint.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {
      await checkpoint.$disconnect();
    }
    fs.copyFileSync(fixturePath, cloudPath);

    const cloud = new PrismaClient({ datasources: { db: { url: `file:${cloudPath}` } } });
    const before = {
      users: await cloud.appUser.count(),
      sessions: await cloud.authSession.count(),
      meta: await cloud.appMeta.count(),
    };
    expect(before.users).toBeGreaterThan(0);
    expect(before.meta).toBeGreaterThan(0);

    const result = await stagedRestoreFromSupabase(cloud, { force: true, acknowledgeUnsynced: true }, {
      activePath: cloudPath,
      fetchRows: async () => ({ rows: [] }),
      disconnectActive: () => cloud.$disconnect(),
    });
    expect(result.success).toBe(true);

    const check = new PrismaClient({ datasources: { db: { url: `file:${cloudPath}` } } });
    try {
      expect(await check.appUser.count()).toBe(before.users);
      expect(await check.authSession.count()).toBe(before.sessions);
      expect(await check.appMeta.count()).toBe(before.meta);
      const enrolled = await check.appMeta.findUnique({ where: { key: ENROLLMENT_KEY } });
      expect(enrolled?.value).toBe("true");
      const worker = await check.appUser.findFirst({ where: { name: `Worker-${RUN}` } });
      expect(worker?.active).toBe(false); // identity carried exactly, not reset
    } finally {
      await check.$disconnect();
    }
    clearRestartRequiredForProcessStart();
  });
});

// FULL57: durable restart barrier. FULL55/56 kept the barrier in module
// memory only; a separate bundle instance (Next route handlers vs server
// actions) never saw it, so HTTP export returned 200 after a restore.
describe("durable restart barrier (FULL57)", () => {
  it("a fresh module instance in the same process refuses; a restarted process clears the stale marker", async () => {
    const { spawnSync } = await import("node:child_process");
    clearRestartRequiredForProcessStart();
    // Child = a separate MODULE instance landscape. Inside it, mark via one
    // instance, then assert via a second cache-busted instance (same process,
    // same PID - exactly the route-bundle vs action-bundle situation).
    const modulePath = path.resolve("src/lib/sync/restore-state.ts");
    const childScript = path.join(path.dirname(fixturePath), `barrier-child-${RUN}.mjs`);
    fs.writeFileSync(childScript, [
      `const m1 = await import(${JSON.stringify(modulePath)});`,
      `m1.markRestartRequired();`,
      `const m2 = await import(${JSON.stringify(modulePath + "?fresh=1")});`,
      `try { m2.assertRestartNotRequired(); process.exit(3); } catch { process.exit(0); }`,
    ].join("\n"));
    const child = spawnSync(process.execPath, ["--import", "tsx", childScript], { env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }, encoding: "utf8" });
    expect(child.status).toBe(0); // 0 = second instance refused via the durable marker; 3 = barrier missed
    // The child has exited, so its marker PID is dead: this process (a
    // "restart" relative to the marker) clears it and is allowed through.
    expect(fs.existsSync(fixturePath + ".restart-required")).toBe(true);
    const { assertRestartNotRequired } = await import("@/lib/sync/restore-state");
    clearRestartRequiredForProcessStart();
    fs.writeFileSync(fixturePath + ".restart-required", JSON.stringify({ pid: child.pid, at: new Date().toISOString(), reason: "database restore" }));
    assertRestartNotRequired(); // dead PID: inert, no throw
    // FULL61: barrier checks NEVER remove markers; a dead-owner marker stays
    // as harmless garbage and is reclaimed in place by a later begin.
    expect(fs.existsSync(fixturePath + ".restart-required")).toBe(true);
  });
});

describe("durable restart intent (FULL58)", () => {
  let intentAdminToken = "";
  const markerFile = fixturePath + ".restart-required";

  it("seeds an enrolled control-principal session for intent tests", async () => {
    clearRestartRequiredForProcessStart();
    // The earlier restore tests swapped the active database file; this suite's
    // long-lived client still points at the moved-aside inode. Reconnect.
    await prisma.$disconnect().catch(() => {});
    prisma = freshClient();
    const { hash, salt } = hashPin(genPin());
    const admin = await prisma.appUser.create({ data: { name: `IntentOwner-${RUN}`, pinHash: hash, pinSalt: salt, role: "owner" } });
    await prisma.appMeta.upsert({ where: { key: ENROLLMENT_KEY }, update: { value: "true" }, create: { key: ENROLLMENT_KEY, value: "true" } });
    await prisma.appMeta.upsert({ where: { key: CONTROL_PRINCIPAL_KEY }, update: { value: admin.id }, create: { key: CONTROL_PRINCIPAL_KEY, value: admin.id } });
    intentAdminToken = await makeSession(admin.id);
    expect(intentAdminToken).toBeTruthy();
  });

  it("a second intent is refused while one is outstanding (concurrent ownership)", async () => {
    const rs = await import("@/lib/sync/restore-state");
    rs.clearRestartRequiredForProcessStart();
    const t1 = rs.beginRestartIntent();
    expect(() => rs.beginRestartIntent()).toThrow(/Another operation holds the restart barrier/);
    rs.abandonRestartIntent(t1);
    // FULL61/63: abandon never unlinks; it neutralizes our marker in place.
    const abandoned = JSON.parse(fs.readFileSync(markerFile, "utf8"));
    expect(abandoned.abandoned).toBe(true);
    expect(abandoned.token).toBe(t1);
    expect(() => rs.assertRestartNotRequired()).not.toThrow(); // inert
    // FULL63: begin NEVER reclaims - even a released marker blocks begin until
    // a process-start/lifecycle sweep removes it.
    expect(() => rs.beginRestartIntent()).toThrow(/Restart the application/);
    rs.clearRestartRequiredForProcessStart(); // lifecycle sweep removes the released marker
    expect(fs.existsSync(markerFile)).toBe(false);
    const t3 = rs.beginRestartIntent();
    rs.abandonRestartIntent(t3);
    rs.clearRestartRequiredForProcessStart();
  });

  it("finalize and abandon act only on the owning token; a foreign marker is never removed", async () => {
    const rs = await import("@/lib/sync/restore-state");
    rs.clearRestartRequiredForProcessStart();
    const t1 = rs.beginRestartIntent();
    expect(() => rs.finalizeRestartIntent("wrong-token")).toThrow(/ownership lost/);
    rs.abandonRestartIntent("wrong-token");
    expect(fs.existsSync(markerFile)).toBe(true); // not ours: untouched
    rs.abandonRestartIntent(t1);
    // FULL61/63: ours is neutralized in place (abandoned:true), never unlinked.
    expect(JSON.parse(fs.readFileSync(markerFile, "utf8")).abandoned).toBe(true);
    // FULL63: the released marker blocks begin until a lifecycle sweep.
    rs.clearRestartRequiredForProcessStart();
    // Success path: finalize arms the durable barrier; a genuine restart (new
    // PID space) releases it because the marker's owner is dead.
    const t2 = rs.beginRestartIntent();
    rs.finalizeRestartIntent(t2);
    expect(() => rs.assertRestartNotRequired()).toThrow(/Restart the application/);
    rs.clearRestartRequiredForProcessStart();
    // Lifecycle reset neutralizes THIS process's own live marker in place; a
    // genuine restart leaves a dead marker, which is equally inert. Neither
    // path ever removes or overwrites a foreign marker.
    expect(() => rs.assertRestartNotRequired()).not.toThrow();
    const after = JSON.parse(fs.readFileSync(markerFile, "utf8"));
    expect(after.abandoned).toBe(true); // inert, never removed
    expect(fs.existsSync(markerFile)).toBe(true);
  });

  it("acquisition is atomic and exclusive: a foreign live marker is never overwritten, its bytes stay intact", async () => {
    const rs = await import("@/lib/sync/restore-state");
    rs.clearRestartRequiredForProcessStart();
    // Foreign operation's marker with a LIVE pid (this process stands in as owner).
    const foreignPayload = JSON.stringify({ pid: process.pid, at: new Date().toISOString(), reason: "foreign op", token: "foreign-token" });
    fs.writeFileSync(markerFile, foreignPayload);
    expect(() => rs.beginRestartIntent()).toThrow(/Another operation holds the restart barrier/);
    expect(fs.readFileSync(markerFile, "utf8")).toBe(foreignPayload); // untouched, byte-identical
    expect(fs.readdirSync(path.dirname(fixturePath)).filter((f) => f.includes("restart-required."))).toEqual([]); // no temp debris
    fs.rmSync(markerFile, { force: true });
    rs.clearRestartRequiredForProcessStart();
  });

  it("a dead-PID marker blocks begin until a process-start sweep; an unverifiable marker is refused fail-closed", async () => {
    const rs = await import("@/lib/sync/restore-state");
    rs.clearRestartRequiredForProcessStart();
    // Dead-PID marker: the owning process exited, so a restart already happened.
    const { spawnSync } = await import("node:child_process");
    const dead = spawnSync(process.execPath, ["-e", ""], { encoding: "utf8" });
    const stalePayload = JSON.stringify({ pid: dead.pid, at: new Date().toISOString(), token: "stale-token" });
    fs.writeFileSync(markerFile, stalePayload);
    // FULL63: NO takeover - begin refuses honestly and the marker is intact.
    expect(() => rs.beginRestartIntent()).toThrow(/Restart the application/);
    expect(fs.readFileSync(markerFile, "utf8")).toBe(stalePayload);
    // The process-start sweep (bootstrap caller) clears it and restores are available again.
    rs.clearStaleBarrierAtProcessStart();
    expect(fs.existsSync(markerFile)).toBe(false);
    const token = rs.beginRestartIntent();
    expect(JSON.parse(fs.readFileSync(markerFile, "utf8")).token).toBe(token);
    rs.abandonRestartIntent(token);
    expect(JSON.parse(fs.readFileSync(markerFile, "utf8")).abandoned).toBe(true);
    rs.clearRestartRequiredForProcessStart();
    expect(fs.existsSync(markerFile)).toBe(false);
    // Unverifiable marker (corrupt content): refuse, leave it in place.
    fs.writeFileSync(markerFile, "not json");
    expect(() => rs.beginRestartIntent()).toThrow(/cannot be verified/);
    expect(fs.readFileSync(markerFile, "utf8")).toBe("not json");
    fs.rmSync(markerFile, { force: true });
    rs.clearRestartRequiredForProcessStart();
  });

  it("finalize mutates no files and leaves no temp debris", async () => {
    const rs = await import("@/lib/sync/restore-state");
    rs.clearRestartRequiredForProcessStart();
    const token = rs.beginRestartIntent();
    const dirListing = () => fs.readdirSync(path.dirname(fixturePath)).filter((f) => f.includes("restart-required")).sort();
    const contentBefore = fs.readFileSync(markerFile, "utf8");
    rs.finalizeRestartIntent(token);
    expect(dirListing()).toEqual(["fixture.db.restart-required"]); // exactly the marker, no .tmp/.final.tmp
    expect(fs.readFileSync(markerFile, "utf8")).toBe(contentBefore); // unchanged
    expect(() => rs.assertRestartNotRequired()).toThrow(/Restart the application/); // barrier armed
    rs.clearRestartRequiredForProcessStart();
  });

  it("an unpersistable intent aborts with no marker and no temp debris", async () => {
    const { spawnSync } = await import("node:child_process");
    const modulePath = path.resolve("src/lib/sync/restore-state.ts");
    const childScript = path.join(path.dirname(fixturePath), `intent-child-${RUN}.mjs`);
    // DATABASE_URL inside a directory that does not exist: the marker temp
    // write fails (ENOTDIR/ENOENT), so beginRestartIntent must throw and must
    // leave neither the marker nor any temp file behind.
    const bogusDir = path.join(path.dirname(fixturePath), `no-such-dir-${RUN}`);
    fs.writeFileSync(childScript, [
      `const m = await import(${JSON.stringify(modulePath)});`,
      `try { m.beginRestartIntent(); process.exit(3); } catch {`,
      `  const fs = await import("fs");`,
      `  const marker = ${JSON.stringify(path.join(bogusDir, "app.db.restart-required"))};`,
      `  if (fs.existsSync(marker)) process.exit(4);`,
      `  process.exit(0);`,
      `}`,
    ].join("\n"));
    const child = spawnSync(process.execPath, ["--import", "tsx", childScript], { env: { ...process.env, DATABASE_URL: `file:${path.join(bogusDir, "app.db")}` }, encoding: "utf8" });
    expect(child.status).toBe(0); // 3 = intent silently succeeded; 4 = marker/debris left behind
    fs.rmSync(childScript, { force: true });
  });

  it("a barrier-finalize fault rolls the restore back: database byte-identical, intent released, no stray artifacts", async () => {
    const rs = await import("@/lib/sync/restore-state");
    rs.clearRestartRequiredForProcessStart();
    const before = sha256(fixturePath);
    const dataDir = path.dirname(fixturePath);
    const artifactsBefore = new Set(fs.readdirSync(dataDir).filter((f) => /pre-restore|restore-stage|restart-required/.test(f)));
    const backup = (await createLocalBackup(intentAdminToken)) as any;
    if (!backup.success) throw new Error(`createLocalBackup failed: ${backup.message}`);
    expect(backup.success).toBe(true);
    const name = /Backup created: (.+\.bak)/.exec(backup.message)?.[1];
    expect(name).toBeTruthy();
    (globalThis as any).__forceFinalizeFault = true;
    const result = await restoreLocalBackup(name!, intentAdminToken);
    expect(result.success).toBe(false);
    expect(sha256(fixturePath)).toBe(before); // original database rolled back byte-identically
    // FULL61: release = neutralized in place (abandoned:true), never unlinked.
    const released1 = JSON.parse(fs.readFileSync(markerFile, "utf8"));
    expect(released1.abandoned).toBe(true); // our intent released, barrier inert
    const newArtifacts = fs.readdirSync(dataDir).filter((f) => /pre-restore|restore-stage|restart-required/.test(f) && !artifactsBefore.has(f));
    // The only new artifacts are the retained failed swap image (pre-existing
    // design: kept for forensics) and the released intent marker, neutralized
    // IN PLACE (abandoned:true, swept at the next process start - FULL63).
    // No temp files and no unconsumed pre-restore copy may survive a rollback.
    expect(newArtifacts.sort()).toEqual([`${path.basename(fixturePath)}.restore-stage.failed`, `${path.basename(fixturePath)}.restart-required`].sort());
    expect(await freshClient().appUser.count()).toBeGreaterThan(0); // original data intact (fresh handle: the restore replaced the file)
  });
});

describe("staged cloud restore: swap-window intent (FULL59)", () => {
  const markerFile = fixturePath + ".restart-required";

  function makeCloudCopy(tag: string): string {
    const cloudPath = path.join(path.dirname(fixturePath), `cloud-${tag}-${RUN}.db`);
    fs.copyFileSync(fixturePath, cloudPath);
    return cloudPath;
  }
  const emptyRemote = async () => ({ rows: [] });

  it("the intent marker is held across the swap window and released on success (refresh-and-continue)", async () => {
    const rs = await import("@/lib/sync/restore-state");
    rs.clearRestartRequiredForProcessStart();
    const cloudPath = makeCloudCopy("win");
    const cloud = new PrismaClient({ datasources: { db: { url: `file:${cloudPath}` } } });
    let markerSeenInWindow = false;
    let childRefusedInWindow = -1;
    const result = await stagedRestoreFromSupabase(cloud, { force: true, acknowledgeUnsynced: true }, {
      activePath: cloudPath,
      fetchRows: emptyRemote,
      disconnectActive: async () => {
        // Mid-window: the swap region starts right after disconnect. The marker
        // must already be durable and must refuse a SECOND module instance
        // (the cross-bundle situation). Verified via a child process because a
        // fresh in-process import shares this bundle's module state.
        markerSeenInWindow = fs.existsSync(markerFile);
        const { spawnSync } = await import("node:child_process");
        const modulePath = path.resolve("src/lib/sync/restore-state.ts");
        const childScript = path.join(path.dirname(fixturePath), `staged-child-${RUN}.mjs`);
        fs.writeFileSync(childScript, [
          `const m = await import(${JSON.stringify(modulePath)});`,
          `try { m.assertRestartNotRequired(); process.exit(3); } catch { process.exit(0); }`,
        ].join("\n"));
        const child = spawnSync(process.execPath, ["--import", "tsx", childScript], { env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }, encoding: "utf8" });
        childRefusedInWindow = child.status ?? -1;
        fs.rmSync(childScript, { force: true });
        await cloud.$disconnect();
      },
    });
    expect(result.success).toBe(true);
    expect(markerSeenInWindow).toBe(true); // durable intent present before the swap region
    expect(childRefusedInWindow).toBe(0); // a separate module instance (bundle) refused mid-window
    // Continue contract: the marker is released in place, this process is NOT barred.
    expect(JSON.parse(fs.readFileSync(markerFile, "utf8")).abandoned).toBe(true);
    rs.assertRestartNotRequired();
    const check = new PrismaClient({ datasources: { db: { url: `file:${cloudPath}` } } });
    try {
      expect(await check.appUser.count()).toBeGreaterThan(0); // identity carried, data queryable
    } finally {
      await check.$disconnect();
    }
  });

  it("a swap failure rolls back byte-identically and releases only OUR intent marker", async () => {
    const rs = await import("@/lib/sync/restore-state");
    rs.clearRestartRequiredForProcessStart();
    const cloudPath = makeCloudCopy("rollback");
    const before = sha256(cloudPath);
    const cloud = new PrismaClient({ datasources: { db: { url: `file:${cloudPath}` } } });
    (globalThis as any).__failStageMoveTo = cloudPath;
    const result = await stagedRestoreFromSupabase(cloud, { force: true, acknowledgeUnsynced: true }, {
      activePath: cloudPath,
      fetchRows: emptyRemote,
      disconnectActive: () => cloud.$disconnect(),
    });
    expect(result.success).toBe(false);
    expect(result.errors[0].error).toMatch(/injected swap fault/); // the fault reached the stage->active move
    expect(sha256(cloudPath)).toBe(before); // original database rolled back
    // FULL61: our intent released in place (abandoned:true), never unlinked.
    expect(JSON.parse(fs.readFileSync(markerFile, "utf8")).abandoned).toBe(true);
    const stageDebris = fs.readdirSync(path.dirname(cloudPath)).filter((f) => f.includes("rollback") && (f.includes("staging") || f.endsWith(".failed")));
    expect(stageDebris).toEqual([]); // no staged remnants after rollback + cleanup
    rs.assertRestartNotRequired(); // no barrier retained
  });

  it("another operation's marker is never removed or overwritten: the restore refuses", async () => {
    const rs = await import("@/lib/sync/restore-state");
    rs.clearRestartRequiredForProcessStart();
    // A live-PID marker from ANOTHER operation holds the barrier.
    fs.writeFileSync(markerFile, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), reason: "database restore", token: "not-our-token" }));
    const cloudPath = makeCloudCopy("foreign");
    const before = sha256(cloudPath);
    const cloud = new PrismaClient({ datasources: { db: { url: `file:${cloudPath}` } } });
    const result = await stagedRestoreFromSupabase(cloud, { force: true, acknowledgeUnsynced: true }, {
      activePath: cloudPath,
      fetchRows: emptyRemote,
      disconnectActive: () => cloud.$disconnect(),
    });
    expect(result.success).toBe(false);
    expect(result.errors[0].error).toMatch(/not changed/i);
    expect(sha256(cloudPath)).toBe(before); // untouched
    const foreign = JSON.parse(fs.readFileSync(markerFile, "utf8"));
    expect(foreign.token).toBe("not-our-token"); // intact
    fs.rmSync(markerFile, { force: true });
    rs.clearRestartRequiredForProcessStart();
  });
});
