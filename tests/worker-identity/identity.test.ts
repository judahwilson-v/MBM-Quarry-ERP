// Worker identity & attribution acceptance suite.
// PIN fixture policy: every PIN below is generated at random per run
// (crypto-based), never a real or reused credential, and never logged.
import { describe, it, expect, beforeAll, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { ALL_MIGRATIONS } from "@/lib/migrations";
import { login, logout, resolveActor, isEnrollmentComplete, requireActor } from "@/app/actions/auth";
import { saveUser, listUsers, resetUserPin, setUserActive } from "@/app/actions/users";
import { saveSale, deleteSale } from "@/app/actions/sales";
import { updateGlobalSettings } from "@/app/actions/settings";

import { CONTROL_PRINCIPAL_KEY } from "@/lib/identity/service";
const prisma = new PrismaClient();
const genPin = () => crypto.randomInt(100000, 999999).toString();
const RUN = crypto.randomBytes(3).toString("hex");
// Global settings control PINs (bootstrap-created, rotated once below).
let settingsAdminPin = genPin();
let settingsDeletePin = genPin();
const ADMIN_USER_PIN = genPin();
const WORKER_A_PIN = genPin();
const WORKER_B_PIN = genPin();
const NEW_PIN = genPin();
const ADMIN = `Admin-${RUN}`;
let adminToken = "";
const WORKER_A = `WorkerA-${RUN}`;
const WORKER_B = `WorkerB-${RUN}`;
const WORKER_X = `WorkerX-${RUN}`;

let materialId = "";
async function saleInput() {
  if (!materialId) {
    const m = await prisma.material.create({ data: { materialName: `M-${RUN}`, ratePerCft: 50 } });
    materialId = m.id;
  }
  return {
    saleDate: "2026-01-05",
    bookNumber: String(crypto.randomInt(1, 100000)),
    pageNumber: String(crypto.randomInt(1, 100000)),
    vehicleNumber: `KL-TEST-${RUN}-${crypto.randomInt(1000, 9999)}`,
    partyName: `P-${RUN}`,
    materialId,
    ratePerCft: 50,
    qty: 10,
    discountType: "fixed" as const,
    discountValue: 0,
    cashPaid: 0,
    bankPaid: 0,
    gPayPaid: 0,
  };
}

describe("migration registration", () => {
  it("registers 006_worker_identity with the three local identity tables", async () => {
    // FULL56 added 007_change_requests and FULL57 added
    // 008_change_request_fingerprint after this suite was written; the
    // identity migration keeps its position and content, now at index 5 of 8.
    expect(ALL_MIGRATIONS.length).toBe(8);
    const m = ALL_MIGRATIONS[5];
    expect(m.id).toBe("006_worker_identity");
    expect(m.version).toBe(6);
    const last = ALL_MIGRATIONS[7];
    expect(last.id).toBe("008_change_request_fingerprint");
    expect(last.version).toBe(8);
    // 008 is idempotent like 003: it introspects PRAGMA table_info first, so
    // stub the query (column absent) to see the ALTER it would emit.
    const lastSql = (await last.up({ $queryRawUnsafe: async () => [] } as any)).join("\n");
    expect(lastSql).toContain("record_fingerprint");
    const skipSql = await last.up({ $queryRawUnsafe: async () => [{ name: "record_fingerprint" }] } as any);
    expect(skipSql).toEqual([]);
    const seven = ALL_MIGRATIONS[6];
    expect(seven.id).toBe("007_change_requests");
    expect(seven.version).toBe(7);
    const sevenSql = (await seven.up({} as any)).join("\n");
    expect(sevenSql).toContain("change_requests");
    const sql = (await m.up({} as any)).join("\n");
    expect(sql).toContain("app_users");
    expect(sql).toContain("auth_sessions");
    expect(sql).toContain("app_meta");
  });
});

describe("bootstrap and enrollment state", () => {
  it("production without enrollment refuses unauthenticated mutations and bootstrap", async () => {
    try {
      vi.stubEnv("NODE_ENV", "production");
      await expect(requireActor()).rejects.toThrow(/not configured/);
      expect((await saveUser({ name: "Unconfigured", pin: genPin() })).success).toBe(false);
    } finally { vi.unstubAllEnvs(); }
  });
  it("starts un-enrolled; first user creation completes enrollment", async () => {
    expect(await isEnrollmentComplete()).toBe(false);
    // Bootstrap: no users exist yet, so no admin PIN can be required.
    const r = await saveUser({ name: ADMIN, pin: ADMIN_USER_PIN, role: "approver" });
    expect(r.success).toBe(true);
    expect(await isEnrollmentComplete()).toBe(true);
  });
  it("a login and approver label do not configure privileged controls", async () => {
    adminToken = (await login(ADMIN, ADMIN_USER_PIN)).token!;
    const r = await saveUser({ name: `Unauthorized-${RUN}`, pin: genPin(), role: "approver" }, settingsAdminPin, adminToken);
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/not configured/);
    const st = await updateGlobalSettings({ adminPin: settingsAdminPin } as any, settingsAdminPin, adminToken);
    expect(st.success).toBe(false);
    expect(st.message).toMatch(/not configured/);
  });
  it("enrollment persists; the last active user can never be deactivated", async () => {
    // SYNTHETIC PROOF ONLY: seed the owner-authorized identity in the fixture.
    // There is deliberately no production enrollment/setter action in this unit.
    const admin = (await listUsers()).find((u: any) => u.name === ADMIN)!;
    await prisma.appMeta.create({ data: { key: CONTROL_PRINCIPAL_KEY, value: admin.id } });
    // Seed legacy settings directly in the fixture; no default/reused PINs.
    await prisma.globalSettings.create({ data: { id: "default", adminPin: settingsAdminPin, deletePin: settingsDeletePin } });
    adminToken = (await login(ADMIN, ADMIN_USER_PIN)).token!;
    const c = await saveUser({ name: WORKER_X, pin: genPin(), role: "worker" }, settingsAdminPin, adminToken);
    expect(c.success).toBe(true);
    const wx = (await listUsers()).find((u: any) => u.name === WORKER_X)!;
    expect((await setUserActive(wx.id, false, settingsAdminPin, adminToken)).success).toBe(true);
    // Deactivating users never reopens setup mode...
    expect(await isEnrollmentComplete()).toBe(true);
    // ...and the last active user cannot be deactivated at all, so privileged
    // control can never be locked out by user management.
    const d = await setUserActive(admin.id, false, settingsAdminPin, adminToken);
    expect(d.success).toBe(false);
    expect(await isEnrollmentComplete()).toBe(true);
  });
});

describe("session lifecycle is server-enforced", () => {
  let token = "";
  it("login succeeds with correct name+PIN and issues a token", async () => {
    const r = await login(ADMIN, ADMIN_USER_PIN);
    expect(r.success).toBe(true);
    expect(typeof r.token).toBe("string");
    token = r.token!;
    const a = await resolveActor(token);
    expect(a).toMatchObject({ name: ADMIN, role: "approver" });
  });
  it("login fails with a wrong PIN", async () => {
    const r = await login(ADMIN, genPin());
    expect(r.success).toBe(false);
  });
  it("locks after 5 consecutive failures for 10 minutes", async () => {
    const c = await saveUser({ name: WORKER_A, pin: WORKER_A_PIN, role: "worker" }, settingsAdminPin, adminToken);
    expect(c.success).toBe(true);
    for (let i = 0; i < 5; i++) {
      await login(WORKER_A, genPin());
    }
    const locked = await login(WORKER_A, WORKER_A_PIN);
    expect(locked.success).toBe(false);
    expect(locked.message).toMatch(/too many failed attempts/i);
  });
  it("logout invalidates the session", async () => {
    await logout(token);
    expect(await resolveActor(token)).toBeNull();
  });
  it("an expired session is rejected", async () => {
    const r = await login(ADMIN, ADMIN_USER_PIN);
    expect(r.success).toBe(true);
    await prisma.authSession.update({ where: { token: r.token! }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resolveActor(r.token!)).toBeNull();
  });
  it("a deactivated user's session is rejected", async () => {
    const c = await saveUser({ name: WORKER_B, pin: WORKER_B_PIN, role: "worker" }, settingsAdminPin, adminToken);
    expect(c.success).toBe(true);
    const r = await login(WORKER_B, WORKER_B_PIN);
    expect(r.success).toBe(true);
    const u = (await listUsers()).find((x: any) => x.name === WORKER_B)!;
    await setUserActive(u.id, false, settingsAdminPin, adminToken);
    expect(await resolveActor(r.token!)).toBeNull();
    await setUserActive(u.id, true, settingsAdminPin, adminToken);
  });
});

describe("money mutations require a session once enrolled", () => {
  let adminToken = "";
  let workerToken = "";
  beforeAll(async () => {
    adminToken = (await login(ADMIN, ADMIN_USER_PIN)).token!;
    workerToken = (await login(WORKER_B, WORKER_B_PIN)).token!;
  });
  it("saveSale without a token fails and writes nothing", async () => {
    const input = await saleInput();
    const r = await saveSale(input as any);
    expect(r.success).toBe(false);
    const count = await prisma.outgoingSale.count({ where: { vehicleNumber: input.vehicleNumber } });
    expect(count).toBe(0);
  });
  it("saveSale with a bogus token fails", async () => {
    const input = await saleInput();
    const r = await saveSale(input as any, undefined, "not-a-real-token");
    expect(r.success).toBe(false);
  });
  it("saveSale with a valid token succeeds and attributes the actor", async () => {
    const input = await saleInput();
    const r = await saveSale(input as any, undefined, workerToken);
    expect(r.success).toBe(true);
    const saleId = (r as any).data.id as string;
    const audit = await prisma.auditLog.findFirst({ where: { entityName: "Sale", entityId: saleId, action: "create" } });
    expect(audit).not.toBeNull();
    expect(JSON.parse(audit!.payload as string).role).toBe(WORKER_B);
    await deleteSale(saleId, settingsDeletePin, adminToken);
  });
  it("deleteSale without a token fails and keeps the row", async () => {
    const input = await saleInput();
    const r = await saveSale(input as any, undefined, workerToken);
    expect(r.success).toBe(true);
    const saleId = (r as any).data.id as string;
    const d = await deleteSale(saleId, settingsDeletePin);
    expect(d.success).toBe(false);
    expect(await prisma.outgoingSale.findUnique({ where: { id: saleId } })).not.toBeNull();
    await deleteSale(saleId, settingsDeletePin, adminToken);
  });
  it("deleteSale with a token but no delete PIN still fails", async () => {
    const input = await saleInput();
    const r = await saveSale(input as any, undefined, workerToken);
    expect(r.success).toBe(true);
    const saleId = (r as any).data.id as string;
    const d = await deleteSale(saleId, undefined, workerToken);
    expect(d.success).toBe(false);
    expect(await prisma.outgoingSale.findUnique({ where: { id: saleId } })).not.toBeNull();
    await deleteSale(saleId, settingsDeletePin, adminToken);
  });
});

describe("control mutations guarded by admin PIN", () => {
  it("updateGlobalSettings with a wrong admin PIN fails", async () => {
    const r = await updateGlobalSettings({ adminPin: genPin() } as any, genPin(), adminToken);
    expect(r.success).toBe(false);
  });
  it("updateGlobalSettings with the correct PIN but no session fails", async () => {
    const r = await updateGlobalSettings({ gstNumber: "NOSESSION" } as any, settingsAdminPin);
    expect(r.success).toBe(false);
  });
  it("saveUser with the admin PIN but no session fails", async () => {
    const r = await saveUser({ name: `NoSess-${RUN}`, pin: genPin(), role: "worker" }, settingsAdminPin);
    expect(r.success).toBe(false);
  });
  it("saveUser with a wrong admin PIN fails", async () => {
    const r = await saveUser({ name: `Nope-${RUN}`, pin: genPin(), role: "worker" }, genPin(), adminToken);
    expect(r.success).toBe(false);
  });
  it("a worker session plus shared admin PIN cannot grant privileges", async () => {
    const token = (await login(WORKER_B, WORKER_B_PIN)).token!;
    const r = await saveUser({ name: `NoGrant-${RUN}`, pin: genPin(), role: "approver" }, settingsAdminPin, token);
    expect(r.success).toBe(false);
    const st = await updateGlobalSettings({ gstNumber: "NOAUTH" }, settingsAdminPin, token);
    expect(st.success).toBe(false);
  });
  it("configured control identity cannot be deactivated even while workers remain active", async () => {
    const u = (await listUsers()).find((x: any) => x.name === ADMIN)!;
    expect((await listUsers()).some((x: any) => x.name !== ADMIN && x.active)).toBe(true);
    const r = await setUserActive(u.id, false, settingsAdminPin, adminToken);
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/control identity/);
    expect(await resolveActor(adminToken)).not.toBeNull();
  });
  it("listUsers never exposes hash or salt", async () => {
    const users = await listUsers();
    for (const u of users) {
      expect(u).not.toHaveProperty("pinHash");
      expect(u).not.toHaveProperty("pinSalt");
    }
  });
  it("resetUserPin with the admin PIN works and revokes sessions", async () => {
    const u = (await listUsers()).find((x: any) => x.name === WORKER_B)!;
    const before = await login(WORKER_B, WORKER_B_PIN);
    expect(before.success).toBe(true);
    const r = await resetUserPin(u.id, NEW_PIN, settingsAdminPin, adminToken);
    expect(r.success).toBe(true);
    expect(await resolveActor(before.token!)).toBeNull();
    expect((await login(WORKER_B, WORKER_B_PIN)).success).toBe(false);
    expect((await login(WORKER_B, NEW_PIN)).success).toBe(true);
  });
  it("settings audit payload omits PIN fields", async () => {
    const nextAdmin = genPin();
    const nextDelete = genPin();
    const r = await updateGlobalSettings({ adminPin: nextAdmin, deletePin: nextDelete } as any, settingsAdminPin, adminToken);
    expect(r.success).toBe(true);
    settingsAdminPin = nextAdmin;
    settingsDeletePin = nextDelete;
    const audit = await prisma.auditLog.findFirst({ where: { entityName: "GlobalSettings", action: "update" }, orderBy: { createdAt: "desc" } });
    const s = audit!.payload as string;
    expect(s).not.toContain("adminPin");
    expect(s).not.toContain("deletePin");
    expect(s).not.toContain(nextAdmin);
    expect(s).not.toContain(nextDelete);
  });
  it("settings outbox events carry no credential fields", async () => {
    const ev = await prisma.syncOutboxEvent.findFirst({ where: { entityType: "GlobalSettings" }, orderBy: { createdAt: "desc" } });
    expect(ev).not.toBeNull();
    const raw = typeof ev!.payload === "string" ? (ev!.payload as string) : JSON.stringify(ev!.payload);
    expect(raw).not.toContain("adminPin");
    expect(raw).not.toContain("deletePin");
    expect(raw).not.toContain(settingsAdminPin);
    expect(raw).not.toContain(settingsDeletePin);
  });
  it("control mutations attribute the server-resolved actor", async () => {
    const audit = await prisma.auditLog.findFirst({ where: { entityName: "GlobalSettings", action: "update" }, orderBy: { createdAt: "desc" } });
    expect(JSON.parse(audit!.payload as string).role).toBe(ADMIN);
  });
});
