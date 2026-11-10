/**
 * FULL65: export serves a consistent transaction-boundary snapshot
 * (VACUUM INTO), never raw bytes of the live database file. Raw byte copies
 * tear under concurrent writes (characterized separately); this suite pins
 * the snapshot's consistency, cleanup, and honest failure behavior.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createConsistentSnapshot } from "@/lib/backup-snapshot";

const fixturePath = (process.env.DATABASE_URL || "").replace(/^file:/, "");
const fixtureDir = path.dirname(fixturePath);
const main = new PrismaClient({ datasources: { db: { url: `file:${fixturePath}` } } });

function debris(): string[] {
  return fs.readdirSync(fixtureDir).filter((f) => f.includes(".snapshot-"));
}
async function checkSnapshot(buf: ArrayBuffer, label: string): Promise<{ users: number; sessions: number }> {
  const p = path.join(os.tmpdir(), `snap-check-${label}.db`);
  fs.writeFileSync(p, Buffer.from(buf));
  const c = new PrismaClient({ datasources: { db: { url: `file:${p}` } } });
  try {
    const ic: any = await c.$queryRawUnsafe("PRAGMA integrity_check");
    expect(Array.isArray(ic) && ic.length === 1 && String(ic[0].integrity_check) === "ok", `${label}: integrity_check ${JSON.stringify(ic).slice(0, 120)}`).toBe(true);
    const u: any = await c.$queryRawUnsafe("SELECT COUNT(*) c FROM app_users");
    const s: any = await c.$queryRawUnsafe("SELECT COUNT(*) c FROM auth_sessions");
    return { users: Number(u[0].c), sessions: Number(s[0].c) };
  } finally {
    await c.$disconnect().catch(() => {});
    fs.rmSync(p, { force: true });
  }
}

describe("FULL65 consistent export snapshot", () => {
  afterAll(async () => { await main.$disconnect().catch(() => {}); });

  it("snapshots taken during a hot writer are internally consistent (transaction boundary)", async () => {
    let committed = 0;
    let stop = false;
    const writer = (async () => {
      while (!stop) {
        await main.$transaction(async (tx) => {
          const u = await tx.appUser.create({ data: { name: "w" + committed, pinHash: "h", pinSalt: "s", role: "staff" } });
          await tx.authSession.create({ data: { userId: u.id, token: "t" + committed, expiresAt: new Date(Date.now() + 60000) } });
        });
        committed++;
      }
    })();
    // grow the file so each snapshot takes real time (widens any race window)
    for (let i = 0; i < 300; i++) await new Promise((r) => setTimeout(r, 5));
    const N = 25;
    for (let i = 0; i < N; i++) {
      const buf = await createConsistentSnapshot();
      const counts = await checkSnapshot(buf, `load-${i}`);
      expect(counts.users, `snapshot ${i} tore a transaction boundary`).toBe(counts.sessions);
    }
    stop = true;
    await writer.catch(() => {});
    const final = await checkSnapshot(await createConsistentSnapshot(), "final");
    expect(final.users).toBe(committed);
    expect(debris()).toEqual([]); // no temp files survive success
  }, 120000);

  it("failure is honest, sanitized, and leaves no debris or partial bytes (locked database)", async () => {
    // A real failure mode: another connection holds an exclusive write lock,
    // so the snapshot's read cannot proceed. The caller gets the retryable
    // honest message, never partial bytes, and no temp debris survives.
    const holder = new PrismaClient({ datasources: { db: { url: `file:${fixturePath}` } } });
    try {
      await holder.$executeRawUnsafe("BEGIN EXCLUSIVE");
      await holder.$executeRawUnsafe("INSERT INTO app_users (id, name, pinHash, pinSalt, role, updatedAt) VALUES ('lock-probe', 'x', 'h', 's', 'staff', CURRENT_TIMESTAMP)").catch(() => {});
      try {
        await createConsistentSnapshot();
        expect.unreachable("snapshot must fail while the database is exclusively locked");
      } catch (e: any) {
        expect(e.message).toBe("Could not produce a consistent database snapshot right now; please retry.");
        expect(e.cause).toBeTruthy(); // diagnostics preserved for server logs
        expect(e.message).not.toMatch(/SQL|pragma|VACUUM|code:/i); // public message sanitized
      }
      expect(debris()).toEqual([]);
    } finally {
      await holder.$executeRawUnsafe("ROLLBACK").catch(() => {});
      await holder.$disconnect().catch(() => {});
    }
    // Once the lock is released the snapshot works again (no poisoned state).
    const after = await checkSnapshot(await createConsistentSnapshot(), "after-lock");
    expect(after.users).toBe(after.sessions);
  });

  it("FULL67: a failed unlink is visibly warned and the residual is retained honestly (never force-deleted)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rmSpy = vi.spyOn(fs, "rmSync").mockImplementationOnce(() => { throw new Error("simulated EIO"); });
    let residual: string | null = null;
    try {
      const buf = await createConsistentSnapshot(); // export still succeeds
      expect(buf.byteLength).toBeGreaterThan(0);
      const warnings = errSpy.mock.calls.map((c) => String(c[0]));
      const warn = warnings.find((w) => w.includes("snapshot temp cleanup failed"));
      expect(warn, JSON.stringify(warnings)).toBeTruthy();
      expect(warn).toContain("residual retained");
      expect(warn).not.toMatch(/SQL|pragma|VACUUM|token|pin/i);
      residual = warn!.match(/retained at (.+?) \(/)?.[1] ?? null;
      expect(residual).toBeTruthy();
      // The residual is RETAINED (rm was made to fail); nothing force-deleted it.
      expect(fs.existsSync(residual!)).toBe(true);
    } finally {
      rmSpy.mockRestore();
      errSpy.mockRestore();
      if (residual) fs.rmSync(residual, { force: true }); // test cleanup, real unlink
    }
    expect(debris()).toEqual([]);
  });

  it("FULL67: existing residuals are reported explicitly and left untouched", async () => {
    const leftover = `${fixturePath}.snapshot-deadbeef.tmp`;
    const decoy = `${fixturePath}.snapshot-deadbeef.keep`; // wrong extension: not ours
    fs.writeFileSync(leftover, "partial");
    fs.writeFileSync(decoy, "not-a-temp");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const buf = await createConsistentSnapshot();
      expect(buf.byteLength).toBeGreaterThan(0);
      const notices = errSpy.mock.calls.map((c) => String(c[0]));
      expect(notices.some((n) => n.includes("1 snapshot temp residual(s) present") && n.includes("retained"))).toBe(true);
      expect(fs.existsSync(leftover)).toBe(true); // retained, not deleted
      expect(fs.existsSync(decoy)).toBe(true); // non-matching files never touched
    } finally {
      errSpy.mockRestore();
      fs.rmSync(leftover, { force: true });
      fs.rmSync(decoy, { force: true });
    }
    expect(debris()).toEqual([]);
  });

  it("FULL67 (carried 66 QA): a snapshot read-back failure surfaces the sanitized retry message", async () => {
    const readSpy = vi.spyOn(fs.promises, "readFile").mockRejectedValueOnce(new Error("simulated EIO on read"));
    try {
      await expect(createConsistentSnapshot()).rejects.toThrow("Could not produce a consistent database snapshot right now; please retry.");
      try { await createConsistentSnapshot(); } catch (e: any) {
        expect(e.message).not.toMatch(/EIO|SQL|pragma|VACUUM|code:/i);
        expect(e.cause).toBeTruthy();
      }
    } finally {
      readSpy.mockRestore();
    }
    expect(debris()).toEqual([]);
  });

  it("a missing database reports honestly", async () => {
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = `file:${fixtureDir}/does-not-exist.db`;
    try {
      await expect(createConsistentSnapshot()).rejects.toThrow("Database not found.");
    } finally {
      process.env.DATABASE_URL = original;
    }
    expect(debris()).toEqual([]);
  });
});
