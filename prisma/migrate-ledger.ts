import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function migrate() {
  console.log("Starting ledger migration...");
  const credits = await db.partyCredit.findMany();
  const collections = await db.partyCollection.findMany();
  const parties = await db.party.findMany();

  for (const party of parties) {
    const partyCredits = credits.filter((c) => c.partyName === party.partyName);
    const partyCollections = collections.filter((c) => c.partyId === party.id);

    // Collect all events for the party
    const events: Array<{ date: Date; type: string; refId: string; description: string; debitAmount: number; creditAmount: number; createdAt: Date }> = [];

    for (const credit of partyCredits) {
      // Find sale date if possible
      const sale = await db.outgoingSale.findUnique({ where: { id: credit.saleId } });
      events.push({
        date: sale?.saleDate ?? credit.createdAt,
        type: "SALE",
        refId: credit.saleId,
        description: `Sale ${sale?.serialNumber ? `(Serial: ${sale.serialNumber})` : ''}`,
        debitAmount: credit.amount,
        creditAmount: 0,
        createdAt: credit.createdAt,
      });
    }

    for (const col of partyCollections) {
      events.push({
        date: col.collectionDate,
        type: "PAYMENT_RECEIVED",
        refId: col.id,
        description: `Collection (Cash: ${col.cashPaid}, Bank: ${col.bankPaid}, GPay: ${col.gPayPaid})`,
        debitAmount: 0,
        creditAmount: col.totalAmount,
        createdAt: col.createdAt,
      });
    }

    // Sort by date, then createdAt
    events.sort((a, b) => {
      const dateDiff = a.date.getTime() - b.date.getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    let balance = 0;
    for (const evt of events) {
      balance += evt.debitAmount;
      balance -= evt.creditAmount;
      
      const exists = await db.partyLedger.findFirst({
        where: { refId: evt.refId, type: evt.type }
      });
      
      if (!exists) {
        await db.partyLedger.create({
          data: {
            partyId: party.id,
            partyName: party.partyName,
            date: evt.date,
            type: evt.type,
            refId: evt.refId,
            description: evt.description,
            debitAmount: evt.debitAmount,
            creditAmount: evt.creditAmount,
            balance: balance,
            createdAt: evt.createdAt,
          }
        });
        console.log(`Created ledger entry for ${party.partyName} (${evt.type}) - Balance: ${balance}`);
      }
    }
  }

  console.log("Migration complete.");
  process.exit(0);
}

migrate().catch(console.error);
