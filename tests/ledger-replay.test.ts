import assert from "node:assert/strict";
import { projectLedgerFromFinancialEvent, rebuildLedger } from "@/lib/domain/ledger";

type FinancialEventRecord = {
  eventId: string;
  correlationId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  createdAt: Date;
  payload: Record<string, unknown>;
};

function makeSaleEvent(eventId: string, saleId: string, createdAt: string, amount = 100) {
  return {
    eventId,
    correlationId: saleId,
    eventType: "SALE_CREATED",
    entityType: "Sale",
    entityId: saleId,
    createdAt: new Date(createdAt),
    payload: {
      saleId,
      saleDate: createdAt,
      cashPaid: amount,
      bankPaid: 0,
      gPayPaid: 0,
      remainingCredit: 0,
      finalAmount: amount,
    },
  } satisfies FinancialEventRecord;
}

function createMockTx(events: FinancialEventRecord[], initialLedger: Record<string, unknown>[] = []) {
  const ledgerEntries = [...initialLedger];
  const tx: any = {
    financialEvent: {
      findMany: async () =>
        [...events].sort((left, right) =>
          left.createdAt.getTime() === right.createdAt.getTime()
            ? left.eventId.localeCompare(right.eventId)
            : left.createdAt.getTime() - right.createdAt.getTime(),
        ),
    },
    ledgerEntry: {
      findUnique: async ({ where }: { where: { financialEventId: string } }) =>
        ledgerEntries.find((entry) => entry.financialEventId === where.financialEventId) ?? null,
      upsert: async ({ where, create, update }: { where: { financialEventId: string }; create: any; update: any }) => {
        const existing = ledgerEntries.find((entry) => entry.financialEventId === where.financialEventId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        ledgerEntries.push({ ...create });
        return create;
      },
      deleteMany: async (args: any = {}) => {
        const where = args?.where;
        // FULL73: rebuild wipes all (deleteMany({})); a correction projection
        // supersedes selectively (entityId + eventType, excluding the new
        // event's own row). The double must honor the filter.
        if (!where || Object.keys(where).length === 0) {
          ledgerEntries.splice(0, ledgerEntries.length);
          return;
        }
        for (let i = ledgerEntries.length - 1; i >= 0; i--) {
          const e = ledgerEntries[i] as any;
          if (where.entityId !== undefined && e.entityId !== where.entityId) continue;
          if (where.eventType !== undefined && e.eventType !== where.eventType) continue;
          if (where.financialEventId?.not !== undefined && e.financialEventId === where.financialEventId.not) continue;
          ledgerEntries.splice(i, 1);
        }
      },
      create: async ({ data }: { data: any }) => {
        ledgerEntries.push({ ...data });
        return data;
      },
    },
  };

  return { tx, ledgerEntries };
}

async function run() {
  {
    const events = [
      makeSaleEvent("evt-2", "sale-2", "2026-06-26T10:00:00.000Z", 250),
      makeSaleEvent("evt-1", "sale-1", "2026-06-25T10:00:00.000Z", 150),
    ];
    const { tx, ledgerEntries } = createMockTx(events);

    await rebuildLedger(tx);
    const firstRun = JSON.parse(JSON.stringify(ledgerEntries));

    await rebuildLedger(tx);
    assert.deepEqual(JSON.parse(JSON.stringify(ledgerEntries)), firstRun, "replay should be deterministic");
    assert.equal(ledgerEntries.length, 2);
    assert.equal(ledgerEntries[0].financialEventId, "evt-1");
    assert.equal(ledgerEntries[1].financialEventId, "evt-2");
  }

  {
    const event = makeSaleEvent("evt-dup", "sale-dup", "2026-06-26T12:00:00.000Z", 300);
    const { tx, ledgerEntries } = createMockTx([]);

    await projectLedgerFromFinancialEvent(tx, event);
    await projectLedgerFromFinancialEvent(tx, event);

    assert.equal(ledgerEntries.length, 1, "duplicate projection must not create duplicate rows");
    assert.equal(ledgerEntries[0].financialEventId, "evt-dup");
  }

  {
    // FULL73: an approved correction APPENDS a new SALE_CREATED event for the
    // same sale (history immutable); the projection supersedes the original
    // event's row. Rebuild replays in createdAt order, so the latest event's
    // projection is the one that survives.
    const original = makeSaleEvent("evt-orig", "sale-sup", "2026-06-26T10:00:00.000Z", 150);
    const correctionBase = makeSaleEvent("evt-corr", "sale-sup", "2026-06-27T10:00:00.000Z", 120);
    // FULL73R: production correction events carry the supersedes marker.
    const correction = { ...correctionBase, payload: { ...correctionBase.payload, supersedesEventId: "evt-orig" } };
    const { tx, ledgerEntries } = createMockTx([original, correction]);

    await rebuildLedger(tx);
    assert.equal(ledgerEntries.length, 1, "correction projection supersedes the original row");
    assert.equal(ledgerEntries[0].financialEventId, "evt-corr");
    assert.equal(ledgerEntries[0].totalAmount, 120);
  }

  {
    // FULL73R (QA tie finding): identical createdAt on both revisions, and
    // the correction replaying FIRST. The supersedesEventId marker - not the
    // clock, eventId ordering or insertion order - decides the survivor.
    const original = makeSaleEvent("evt-orig2", "sale-sup2", "2026-06-26T10:00:00.000Z", 150);
    const correctionBase = makeSaleEvent("evt-corr2", "sale-sup2", "2026-06-26T10:00:00.000Z", 120);
    const correction = { ...correctionBase, payload: { ...correctionBase.payload, supersedesEventId: "evt-orig2" } };
    const { tx, ledgerEntries } = createMockTx([correction, original]);

    await rebuildLedger(tx);
    assert.equal(ledgerEntries.length, 1, "tie + reversed replay must still yield one row");
    assert.equal(ledgerEntries[0].financialEventId, "evt-corr2", "marker decides, never UUID order");
    assert.equal(ledgerEntries[0].totalAmount, 120);
  }

  {
    const events = [
      makeSaleEvent("evt-a", "sale-a", "2026-06-26T08:00:00.000Z", 100),
      makeSaleEvent("evt-b", "sale-b", "2026-06-26T09:00:00.000Z", 200),
    ];
    const { tx, ledgerEntries } = createMockTx(events, [{ financialEventId: "stale", totalAmount: 999 }]);

    await rebuildLedger(tx);
    assert.equal(ledgerEntries.length, 2, "stale projection should be removed during rebuild");
    assert.deepEqual(
      ledgerEntries.map((entry) => entry.financialEventId),
      ["evt-a", "evt-b"],
    );
  }

  {
    const events = [
      makeSaleEvent("evt-x", "sale-x", "2026-06-26T08:00:00.000Z", 111),
      makeSaleEvent("evt-y", "sale-y", "2026-06-26T09:00:00.000Z", 222),
    ];
    const { tx, ledgerEntries } = createMockTx(events);
    let callCount = 0;
    tx.ledgerEntry.upsert = async ({ where, create, update }: { where: { financialEventId: string }; create: any; update: any }) => {
      callCount += 1;
      if (callCount === 2) {
        throw new Error("interrupted replay");
      }
      const existing = ledgerEntries.find((entry) => entry.financialEventId === where.financialEventId);
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      ledgerEntries.push({ ...create });
      return create;
    };

    await assert.rejects(() => rebuildLedger(tx), /interrupted replay/);
    assert.equal(ledgerEntries.length, 1, "partial replay should leave a partial projection in the mock");
    await rebuildLedger(tx);
    assert.deepEqual(
      ledgerEntries.map((entry) => entry.financialEventId),
      ["evt-x", "evt-y"],
      "recovery rebuild should recreate the full projection",
    );
  }

  console.log("ledger replay reliability tests passed");
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
