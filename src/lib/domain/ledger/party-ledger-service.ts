import { Prisma } from "@prisma/client";

export async function recalculatePartyLedger(tx: Prisma.TransactionClient, partyId: string) {
  const party = await tx.party.findUnique({ where: { id: partyId } });
  if (!party) return;

  // 1. Clear existing ledger for this party
  await tx.partyLedger.deleteMany({ where: { partyId } });

  // 2. Fetch all transactions
  const sales = await tx.outgoingSale.findMany({ where: { partyId } });
  const boulders = await tx.incomingBoulder.findMany({ where: { partyId } });
  const collections = await tx.partyCollection.findMany({ where: { partyId } });
  const payments = await tx.partyPayment.findMany({ where: { partyId } });

  // 3. Map to standard ledger entries
  const entries: Array<{
    date: Date;
    time?: string | null;
    type: string;
    refId: string;
    description: string;
    paymentMethod?: string | null;
    debitAmount: number;
    creditAmount: number;
    createdAt: Date;
  }> = [];

  for (const sale of sales) {
    if (sale.remainingCredit > 0) {
      entries.push({
        date: sale.saleDate,
        time: sale.saleDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        type: "SALE",
        refId: sale.id,
        description: `Sale ${sale.bookNumber ? sale.bookNumber + '/' + sale.pageNumber : ''} (${sale.materialName} - ${sale.vehicleNumber})`,
        debitAmount: sale.remainingCredit, // Customer owes us
        creditAmount: 0,
        createdAt: sale.createdAt,
      });
    }
  }

  for (const boulder of boulders) {
    if (boulder.remainingCredit > 0) {
      entries.push({
        date: boulder.date,
        time: boulder.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        type: "PURCHASE",
        refId: boulder.id,
        description: `Boulder Purchase (${boulder.vehicleNumber})`,
        debitAmount: 0,
        creditAmount: boulder.remainingCredit, // We owe supplier
        createdAt: boulder.createdAt,
      });
    }
  }

  for (const collection of collections) {
    let method = "Cash";
    if (collection.bankPaid > 0) method = "Bank";
    if (collection.gPayPaid > 0) method = "GPay";

    entries.push({
      date: collection.collectionDate,
      time: collection.collectionDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      type: "PAYMENT_RECEIVED",
      refId: collection.id,
      description: collection.remarks || "Payment Received",
      paymentMethod: method,
      debitAmount: 0,
      creditAmount: collection.totalAmount, // Customer paid us (reduces their debit balance)
      createdAt: collection.createdAt,
    });
  }

  for (const payment of payments) {
    let method = "Cash";
    if (payment.bankPaid > 0) method = "Bank";
    if (payment.gPayPaid > 0) method = "GPay";

    entries.push({
      date: payment.paymentDate,
      time: payment.paymentDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      type: "PAYMENT_GIVEN",
      refId: payment.id,
      description: payment.remarks || "Payment Given",
      paymentMethod: method,
      debitAmount: payment.totalAmount, // We paid supplier (reduces our credit balance)
      creditAmount: 0,
      createdAt: payment.createdAt,
    });
  }

  // 4. Sort chronologically
  entries.sort((a, b) => {
    const timeA = a.date.getTime();
    const timeB = b.date.getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  // 5. Calculate running balance and insert
  let runningBalance = 0; // Positive = Customer owes us. Negative = We owe Supplier.
  
  for (const entry of entries) {
    runningBalance += entry.debitAmount;
    runningBalance -= entry.creditAmount;

    await tx.partyLedger.create({
      data: {
        partyId: party.id,
        partyName: party.partyName,
        date: entry.date,
        time: entry.time || null,
        type: entry.type,
        refId: entry.refId,
        description: entry.description,
        paymentMethod: entry.paymentMethod || null,
        debitAmount: entry.debitAmount,
        creditAmount: entry.creditAmount,
        balance: runningBalance,
        createdAt: entry.createdAt,
      },
    });
  }
}
