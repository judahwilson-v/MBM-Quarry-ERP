import { vi, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { copyFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { omitCredentialFields, projectSyncRecord } from "@/lib/sync/credential-hygiene";
const state = vi.hoisted(() => ({ db: null as any, calls: [] as { table: string; row: any }[] }));
vi.mock("@/lib/prisma", () => ({ getDb: async () => state.db }));
vi.mock("@/lib/supabase/client-sync", () => ({ createSyncClient: () => ({ from: (table: string) => ({
  upsert: async (row: any) => { state.calls.push({ table, row }); return { error: null }; },
  delete: () => ({ lt: async () => ({ error: null }) }),
}) }) }));
import { pushSync } from "@/lib/sync/sync-service";
import { deliverPendingOutbox, enqueueOutboxEvent } from "@/lib/sync/outbox";
const pin = () => String(randomInt(100000, 999999));
beforeAll(async () => {
  if (!process.env.MBM_TEST_ROOT) throw new Error("isolated runner required");
  const file = `${process.env.MBM_TEST_ROOT}/egress.db`;
  copyFileSync(`${process.env.MBM_TEST_ROOT}/fixture.db`, file);
  state.db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  await state.db.globalSettings.deleteMany();
  await state.db.auditLog.deleteMany();
  await state.db.syncOutboxEvent.deleteMany();
  await state.db.syncState.deleteMany();
});
afterAll(async () => state.db.$disconnect());
it("sync projection removes both credential spellings and preserves dates/business fields without changing input", () => {
  const a = pin(), b = pin();
  const input = { id: "default", quarryName: "Synthetic", adminPin: a, delete_pin: b, nested: { pinHash: a, pin_salt: b }, updatedAt: new Date() };
  const out = omitCredentialFields(input);
  expect(out.quarryName).toBe(input.quarryName);
  expect(out.updatedAt).toBeInstanceOf(Date);
  expect(JSON.stringify(out).includes(a) || JSON.stringify(out).includes(b)).toBe(false);
  expect(input.adminPin === a && input.delete_pin === b).toBe(true);
});
it("legacy string-encoded settings audits are projected; malformed settings audit fails closed", () => {
  const a = pin();
  const input = { entityName: "GlobalSettings", payload: JSON.stringify({ before: { adminPin: a }, after: { admin_pin: a, id: "default" } }) };
  const out = projectSyncRecord(input);
  expect(out.payload.includes(a)).toBe(false);
  expect(input.payload.includes(a)).toBe(true);
  expect(() => projectSyncRecord({ entityName: "GlobalSettings", payload: "invalid-json" })).toThrow();
  expect(projectSyncRecord({ entityName: "Other", payload: "ordinary-text" }).payload).toBe("ordinary-text");
});
it("real legacy push emits neither PIN fields nor values in entity or old audit upserts", async () => {
  const a = pin(), b = pin();
  const date = new Date("2026-11-09T10:00:00Z");
  const row = await state.db.globalSettings.create({ data: { id: "default", adminPin: a, deletePin: b, updatedAt: date } });
  await state.db.auditLog.create({ data: { id: "legacy-settings", entityName: "GlobalSettings", entityId: "default", action: "update", payload: JSON.stringify({ role: "system", before: row, after: row }), createdAt: date } });
  const result = await pushSync();
  expect(result.status).toBe("IDLE");
  expect(state.calls.some(c => c.table === "global_settings")).toBe(true);
  expect(state.calls.some(c => c.table === "audit_logs" && c.row.id === "legacy-settings")).toBe(true);
  const wire = JSON.stringify(state.calls);
  expect(wire.includes(a) || wire.includes(b) || /admin_pin|delete_pin|adminPin|deletePin/.test(wire)).toBe(false);
  const local = await state.db.auditLog.findUnique({ where: { id: "legacy-settings" } });
  expect(local.payload.includes(a)).toBe(true); // projection, not a history rewrite
});
it("outbox enqueue omits PINs, and delivery projects old pending events without rewriting local history", async () => {
  const a = pin(), b = pin();
  const enqueued = await enqueueOutboxEvent(state.db, { entityType: "GlobalSettings", entityId: "default", operation: "update", payload: { id: "default", adminPin: a, deletePin: b, quarryName: "Synthetic" } });
  expect(enqueued.payload.includes(a) || enqueued.payload.includes(b)).toBe(false);
  const legacy = await state.db.syncOutboxEvent.create({ data: { eventId: "legacy-settings-event", deviceId: "fixture-device", entityType: "GlobalSettings", entityId: "default", operation: "update", payload: JSON.stringify({ id: "default", admin_pin: a, delete_pin: b }) } });
  const outgoing: unknown[] = [];
  const result = await deliverPendingOutbox({ db: state.db, ignoreGate: true, remote: { rpc: async (_fn, args) => { outgoing.push(args); return { data: true, error: null }; } } });
  expect(result.delivered).toBe(2);
  const wire = JSON.stringify(outgoing);
  expect(wire.includes(a) || wire.includes(b) || /admin_pin|delete_pin|adminPin|deletePin/.test(wire)).toBe(false);
  expect((await state.db.syncOutboxEvent.findUnique({ where: { id: legacy.id } })).payload.includes(a)).toBe(true);
});
