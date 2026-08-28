import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { ALL_MIGRATIONS, runMigrations } from "../src/lib/migrations";
import { deliverPendingPartyOutbox, enqueueOutboxEvent, getOrCreateDeviceId } from "../src/lib/sync/outbox";
import { acquireSyncLease, getCurrentLeaseHolder, releaseSyncLease } from "../src/lib/sync/sync-lease";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mbm-phase4-"));
const databasePath = path.join(tempRoot, "outbox.db");
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });

async function main() {
  try {
    const migration = await runMigrations(db, ALL_MIGRATIONS);
    assert.deepEqual(migration.errors, []);
    const tables = await db.$queryRawUnsafe<Array<{ name: string }>>("SELECT name FROM sqlite_master WHERE type = 'table'");
    assert.ok(tables.some((row) => row.name === "device_identity"));
    assert.ok(tables.some((row) => row.name === "sync_outbox_events"));

    const firstDeviceId = await db.$transaction((tx) => getOrCreateDeviceId(tx));
    const secondDeviceId = await db.$transaction((tx) => getOrCreateDeviceId(tx));
    assert.equal(secondDeviceId, firstDeviceId, "device identity was not stable");
    assert.match(firstDeviceId, /^[0-9a-f-]{36}$/i);

    const party = await db.$transaction(async (tx) => {
      const row = await tx.party.create({ data: { partyName: "Outbox Pilot Party" } });
      const event = await enqueueOutboxEvent(tx, { entityType: "Party", entityId: row.id, operation: "create", payload: row });
      return { row, event };
    });
    assert.equal(await db.syncOutboxEvent.count({ where: { eventId: party.event.eventId, status: "PENDING" } }), 1);
    assert.equal((await db.syncOutboxEvent.findUniqueOrThrow({ where: { eventId: party.event.eventId } })).deviceId, firstDeviceId);

    const eventsBeforeRollback = await db.syncOutboxEvent.count();
    await assert.rejects(() => db.$transaction(async (tx) => {
      const row = await tx.party.create({ data: { partyName: "Rolled Back Party" } });
      await enqueueOutboxEvent(tx, { entityType: "Party", entityId: row.id, operation: "create", payload: row });
      throw new Error("simulated process failure");
    }));
    assert.equal(await db.party.count({ where: { partyName: "Rolled Back Party" } }), 0);
    assert.equal(await db.syncOutboxEvent.count(), eventsBeforeRollback, "rolled-back mutation left an outbox event");

    const remoteEvents = new Set<string>();
    const remote = { rpc: async (_fn: string, args: Record<string, unknown>) => {
      const eventId = String(args.p_event_id);
      const firstApply = !remoteEvents.has(eventId);
      remoteEvents.add(eventId);
      return { data: firstApply, error: null };
    }};
    const firstDelivery = await deliverPendingPartyOutbox({ db, remote });
    assert.equal(firstDelivery.delivered, 1);
    assert.equal(firstDelivery.errors.length, 0);
    assert.equal(await db.syncOutboxEvent.count({ where: { status: "ACKED" } }), 1);

    const retryEvent = await db.$transaction(async (tx) => {
      const row = await tx.party.create({ data: { partyName: "Interrupted Delivery Party" } });
      return enqueueOutboxEvent(tx, { entityType: "Party", entityId: row.id, operation: "create", payload: row });
    });
    const interrupted = await deliverPendingPartyOutbox({ db, remote, afterRemoteApply: async () => { throw new Error("simulated process interruption"); } });
    assert.equal(interrupted.delivered, 0);
    assert.equal((await db.syncOutboxEvent.findUniqueOrThrow({ where: { id: retryEvent.id } })).status, "PENDING");
    const recovered = await deliverPendingPartyOutbox({ db, remote });
    assert.equal(recovered.delivered, 1);
    assert.equal(remoteEvents.size, 2, "duplicate retry was applied as a second remote event");

    console.log("Phase 4 checkpoints 1-4: foundation, atomic write, and idempotent delivery passed.");

    // --- Checkpoint 5: sync lease tests ---
    // 5a: Lease can be acquired for a holder
    assert.ok(acquireSyncLease("push"), "push lease should be acquired");
    assert.equal(getCurrentLeaseHolder(), "push");

    // 5b: Concurrent delivery is rejected while push holds the lease
    await assert.rejects(
      () => deliverPendingPartyOutbox({ db, remote }),
      (err: Error) => err.message.includes("Cannot acquire sync lease"),
      "outbox delivery should be rejected when push holds the lease",
    );

    // 5c: Release and verify delivery succeeds after
    releaseSyncLease("push");
    assert.equal(getCurrentLeaseHolder(), null, "lease should be released");

    // 5d: After release, delivery succeeds (no pending events, but no lease error)
    const afterRelease = await deliverPendingPartyOutbox({ db, remote });
    assert.equal(afterRelease.errors.length, 0, "delivery should succeed after lease release");

    console.log("Phase 4 checkpoint 5: sync lease prevents concurrent operations. Passed.");
    console.log("Phase 4 ALL checkpoints (1-5): PASSED.");
  } finally {
    await db.$disconnect();
    try { fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
