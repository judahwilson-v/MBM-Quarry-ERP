import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { ALL_MIGRATIONS, runMigrations } from "../src/lib/migrations";
import { deliverPendingOutbox, enqueueOutboxEvent } from "../src/lib/sync/outbox";
import { setDeliveryMode, resetDeliveryModes } from "../src/lib/sync/delivery-gate";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mbm-phase5-"));
const databasePath = path.join(tempRoot, "outbox.db");
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });

async function main() {
  try {
    setDeliveryMode("Party", "outbox");
    setDeliveryMode("Material", "outbox");
    setDeliveryMode("Vehicle", "outbox");
    setDeliveryMode("Employee", "outbox");
    setDeliveryMode("GlobalSettings", "outbox");
    assert.deepEqual((await runMigrations(db, ALL_MIGRATIONS)).errors, []);
    await db.$transaction(async (tx) => {
      const party = await tx.party.create({ data: { partyName: "Phase 5 Party" } });
      const material = await tx.material.create({ data: { materialName: "Phase 5 Material", ratePerCft: 123 } });
      const vehicle = await tx.vehicle.create({ data: { vehicleNumber: "P5-TEST-001", partyId: party.id, partyName: party.partyName } });
      await enqueueOutboxEvent(tx, { entityType: "Party", entityId: party.id, operation: "create", payload: party });
      await enqueueOutboxEvent(tx, { entityType: "Material", entityId: material.id, operation: "create", payload: material });
      await enqueueOutboxEvent(tx, { entityType: "Vehicle", entityId: vehicle.id, operation: "create", payload: vehicle });
    });

    const calls: Array<Record<string, unknown>> = [];
    const remote = { rpc: async (name: string, args: Record<string, unknown>) => {
      assert.equal(name, "apply_outbox_event");
      calls.push(args);
      return { data: true, error: null };
    }};
    const result = await deliverPendingOutbox({ db, remote });
    assert.deepEqual(result, { attempted: 3, delivered: 3, errors: [] });
    assert.equal(await db.syncOutboxEvent.count({ where: { status: "ACKED" } }), 3);
    const materialCall = calls.find((call) => call.p_entity_type === "Material");
    assert.equal((materialCall?.p_payload as Record<string, unknown>).material_name, "Phase 5 Material");
    assert.equal((materialCall?.p_payload as Record<string, unknown>).materialName, undefined);
    const vehicleCall = calls.find((call) => call.p_entity_type === "Vehicle");
    assert.equal((vehicleCall?.p_payload as Record<string, unknown>).party_id !== undefined, true);

    const updatedMaterial = await db.$transaction(async (tx) => {
      const before = await tx.material.findFirstOrThrow({ where: { materialName: "Phase 5 Material" } });
      const row = await tx.material.update({ where: { id: before.id }, data: { ratePerCft: 456 } });
      const event = await enqueueOutboxEvent(tx, { entityType: "Material", entityId: row.id, operation: "update", payload: row });
      return { row, event };
    });
    assert.equal(await db.syncOutboxEvent.count({ where: { id: updatedMaterial.event.id, status: "PENDING" } }), 1);
    const materialUpdate = await deliverPendingOutbox({ db, remote });
    assert.deepEqual(materialUpdate, { attempted: 1, delivered: 1, errors: [] });
    const materialUpdatePayload = calls.at(-1)?.p_payload as Record<string, unknown>;
    assert.equal(materialUpdatePayload.rate_per_cft, 456);

    const standalone = await db.$transaction(async (tx) => {
      const employee = await tx.employee.create({ data: { name: "Phase 5 Employee", role: "STAFF" } });
      const settings = await tx.globalSettings.upsert({ where: { id: "default" }, update: { quarryName: "Phase 5 Quarry" }, create: { id: "default", quarryName: "Phase 5 Quarry" } });
      const employeeEvent = await enqueueOutboxEvent(tx, { entityType: "Employee", entityId: employee.id, operation: "create", payload: employee });
      const settingsEvent = await enqueueOutboxEvent(tx, { entityType: "GlobalSettings", entityId: settings.id, operation: "create", payload: settings });
      return { employeeEvent, settingsEvent };
    });
    assert.equal(await db.syncOutboxEvent.count({ where: { id: { in: [standalone.employeeEvent.id, standalone.settingsEvent.id] }, status: "PENDING" } }), 2);
    const standaloneDelivery = await deliverPendingOutbox({ db, remote });
    assert.deepEqual(standaloneDelivery, { attempted: 2, delivered: 2, errors: [] });

    const vehicle = await db.vehicle.findFirstOrThrow({ where: { vehicleNumber: "P5-TEST-001" } });
    const vehicleUpdate = await db.$transaction(async (tx) => {
      const row = await tx.vehicle.update({ where: { id: vehicle.id }, data: { tripCount: 9 } });
      return enqueueOutboxEvent(tx, { entityType: "Vehicle", entityId: row.id, operation: "update", payload: row });
    });
    assert.equal(await db.syncOutboxEvent.count({ where: { id: vehicleUpdate.id, status: "PENDING" } }), 1);
    assert.deepEqual(await deliverPendingOutbox({ db, remote }), { attempted: 1, delivered: 1, errors: [] });
    assert.equal((calls.at(-1)?.p_payload as Record<string, unknown>).trip_count, 9);
    console.log("Phase 5 checkpoint 1: generic Party, Material, and Vehicle outbox dispatch passed.");
  } finally {
    resetDeliveryModes();
    await db.$disconnect();
    try { fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
