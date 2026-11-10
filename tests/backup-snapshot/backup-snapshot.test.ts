/**
 * FULL66: shell backup via the machine-authenticated consistent-snapshot
 * endpoint. Pins: disabled without env, constant-time boot-token auth,
 * prefix sanitization (no path escape), fixed-dir scope, barrier behavior,
 * no-overwrite, snapshot consistency, honest failure with no debris, and the
 * token never appearing in responses.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { POST } from "@/app/api/database/backup-snapshot/route";
import { createConsistentSnapshotToFile } from "@/lib/backup-snapshot";

const fixturePath = (process.env.DATABASE_URL || "").replace(/^file:/, "");
const fixtureDir = path.dirname(fixturePath);
const markerFile = fixturePath + ".restart-required";
const TOKEN = "test-boot-token-synthetic";
let backupDir: string;
const main = new PrismaClient({ datasources: { db: { url: `file:${fixturePath}` } } });

function req(token?: string, body?: unknown): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== undefined) headers["x-mbm-backup-token"] = token;
  return new NextRequest("http://localhost/api/database/backup-snapshot", {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function setupEnv() {
  backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "mbm-backup-dir-"));
  process.env.MBM_BACKUP_BOOT_TOKEN = TOKEN;
  process.env.MBM_BACKUP_DIR = backupDir;
}
afterEach(() => {
  delete process.env.MBM_BACKUP_BOOT_TOKEN;
  delete process.env.MBM_BACKUP_DIR;
  try { fs.rmSync(markerFile, { force: true }); } catch { /* ignore */ }
  if (backupDir) fs.rmSync(backupDir, { recursive: true, force: true });
});

async function seedPair(tag: string) {
  await main.$transaction(async (tx) => {
    const u = await tx.appUser.create({ data: { name: tag, pinHash: "h", pinSalt: "s", role: "staff" } });
    await tx.authSession.create({ data: { userId: u.id, token: "tok-" + tag, expiresAt: new Date(Date.now() + 60000) } });
  });
}
async function checkBackup(file: string) {
  const c = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  try {
    const ic: any = await c.$queryRawUnsafe("PRAGMA integrity_check");
    expect(String(ic[0].integrity_check)).toBe("ok");
    const u: any = await c.$queryRawUnsafe("SELECT COUNT(*) c FROM app_users");
    const s: any = await c.$queryRawUnsafe("SELECT COUNT(*) c FROM auth_sessions");
    expect(Number(u[0].c)).toBe(Number(s[0].c));
  } finally { await c.$disconnect().catch(() => {}); }
}

describe("FULL66 shell backup endpoint", () => {
  it("is disabled (404) without the boot env, and refuses wrong or missing tokens (403)", async () => {
    let res = await POST(req(TOKEN));
    expect(res.status).toBe(404);
    setupEnv();
    res = await POST(req()); // missing header
    expect(res.status).toBe(403);
    res = await POST(req("wrong-token"));
    expect(res.status).toBe(403);
    res = await POST(req(TOKEN + "x")); // length-mismatched
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain(TOKEN);
    expect(fs.readdirSync(backupDir)).toEqual([]);
  });

  it("rejects path-escape and invalid prefixes (400); the write stays in the fixed dir", async () => {
    setupEnv();
    for (const bad of ["../x", "a/b", "a\\b", "..", "UPPER", "sp ace", "", "x".repeat(61)]) {
      const res = await POST(req(TOKEN, { prefix: bad }));
      expect(res.status, `prefix ${JSON.stringify(bad)}`).toBe(400);
    }
    expect(fs.readdirSync(backupDir)).toEqual([]);
  });

  it("creates a consistent backup with the preserved filename pattern", async () => {
    setupEnv();
    await seedPair("one");
    await seedPair("two");
    const res = await POST(req(TOKEN, { prefix: "pre-update-1.2.3" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.filename).toMatch(/^MBM_Backup_pre-update-1\.2\.3_\d{4}-\d{2}-\d{2}T[0-9-]+Z\.sqlite$/);
    expect(JSON.stringify(data)).not.toContain(TOKEN);
    const file = path.join(backupDir, data.filename);
    expect(fs.existsSync(file)).toBe(true);
    await checkBackup(file);
    expect(fs.readdirSync(backupDir).filter((f) => !f.startsWith("MBM_Backup_"))).toEqual([]); // no debris
  });

  it("stays consistent while a writer commits (transaction boundary)", async () => {
    setupEnv();
    let stop = false; let i = 0;
    const writer = (async () => {
      while (!stop) { await seedPair("w" + i++); await new Promise((r) => setTimeout(r, 2)); }
    })();
    for (let k = 0; k < 8; k++) {
      const res = await POST(req(TOKEN, { prefix: "daily" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      await checkBackup(path.join(backupDir, data.filename));
      await new Promise((r) => setTimeout(r, 3)); // distinct timestamps
    }
    stop = true;
    await writer.catch(() => {});
  }, 90000);

  it("honors the restart barrier (409) exactly like export", async () => {
    setupEnv();
    fs.writeFileSync(markerFile, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), token: "armed" }));
    const res = await POST(req(TOKEN, { prefix: "daily" }));
    expect(res.status).toBe(409);
    expect(fs.readdirSync(backupDir)).toEqual([]);
  });

  it("a same-timestamp same-prefix collision is an honest 409 and the winner's file is never deleted", async () => {
    setupEnv();
    await seedPair("collision");
    vi.useFakeTimers({ toFake: ["Date"] }); // only Date: real timers keep Prisma responsive
    vi.setSystemTime(new Date("2026-11-10T12:00:00.000Z"));
    let name = "";
    try {
      const first = await POST(req(TOKEN, { prefix: "daily" }));
      expect(first.status).toBe(200);
      name = (await first.json()).filename;
      // 11 competing callers, same prefix, same fixed clock (QA's 66 shape):
      for (let i = 0; i < 11; i++) {
        const res = await POST(req(TOKEN, { prefix: "daily" }));
        expect(res.status).toBe(409);
        expect((await res.json()).message).toMatch(/refusing to overwrite/);
      }
    } finally {
      vi.useRealTimers(); // real timers before any Prisma await (fake timers starve them)
    }
    // The winner's backup survives every competing failure path.
    const file = path.join(backupDir, name);
    expect(fs.existsSync(file)).toBe(true);
    await checkBackup(file);
    expect(fs.readdirSync(backupDir)).toEqual([name]); // no loser debris either
  });

  it("lib: never overwrites an existing destination; failure leaves no partial file", async () => {
    const dest = path.join(os.tmpdir(), `snap-dest-${Date.now()}.db`);
    await createConsistentSnapshotToFile(dest);
    expect(fs.existsSync(dest)).toBe(true);
    // FULL67 (66 QA ownership fault): a competing non-empty destination is
    // refused and its bytes are NEVER deleted by our failure cleanup.
    const competitor = dest + ".competitor";
    fs.writeFileSync(competitor, "competitor-bytes");
    await expect(createConsistentSnapshotToFile(competitor)).rejects.toThrow("refusing to overwrite");
    expect(fs.readFileSync(competitor, "utf8")).toBe("competitor-bytes");
    fs.rmSync(competitor, { force: true });
    await expect(createConsistentSnapshotToFile(dest)).rejects.toThrow("refusing to overwrite");
    // failure under exclusive lock: no partial destination, honest message
    const holder = new PrismaClient({ datasources: { db: { url: `file:${fixturePath}` } } });
    const dest2 = dest + ".second";
    try {
      await holder.$executeRawUnsafe("BEGIN EXCLUSIVE");
      await expect(createConsistentSnapshotToFile(dest2)).rejects.toThrow("Could not produce a consistent database snapshot right now; please retry.");
      expect(fs.existsSync(dest2)).toBe(false);
    } finally {
      await holder.$executeRawUnsafe("ROLLBACK").catch(() => {});
      await holder.$disconnect().catch(() => {});
      fs.rmSync(dest, { force: true });
    }
  });
});
