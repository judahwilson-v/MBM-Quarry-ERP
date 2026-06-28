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
      deleteMany: async () => {
        ledgerEntries.splice(0, ledgerEntries.length);
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
