import { getDb } from "@/lib/prisma";

export async function getDashboardMetrics() {
  // Local SQLite (Runs on Quarry PC)
  const db = await getDb();
  
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const today = new Date(`${todayStr}T00:00:00.000Z`);
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    salesToday,
    salesMonth,
    purchasesToday,
    purchasesMonth,
    expensesToday,
    expensesMonth,
    latestDayBook,
    parties
  ] = await Promise.all([
    db.outgoingSale.aggregate({
      _sum: { amount: true, finalAmount: true },
      where: { saleDate: { gte: today } }
    }),
    db.outgoingSale.aggregate({
      _sum: { amount: true, finalAmount: true },
      where: { saleDate: { gte: firstOfMonth } }
    }),
    db.incomingBoulder.aggregate({
      _sum: { amount: true },
      where: { date: { gte: today } }
    }),
    db.incomingBoulder.aggregate({
      _sum: { amount: true },
      where: { date: { gte: firstOfMonth } }
    }),
    db.expense.aggregate({
      _sum: { amount: true },
      where: { expenseDate: { gte: today } }
    }),
    db.expense.aggregate({
      _sum: { amount: true },
      where: { expenseDate: { gte: firstOfMonth } }
    }),
    db.dayBook.findFirst({
      orderBy: { businessDate: "desc" }
    }),
    db.party.findMany({
      include: {
        partyLedgers: {
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          take: 1
        }
      }
    })
  ]);

  let totalOutstandingCredit = 0;
  let totalToReceive = 0;
  let totalToPay = 0;

  for (const party of parties) {
    if (party.partyLedgers.length > 0) {
      const bal = party.partyLedgers[0].balance;
      totalOutstandingCredit += bal;
      if (bal > 0) totalToReceive += bal;
      else if (bal < 0) totalToPay += Math.abs(bal);
    }
  }

  return {
    today: {
      sales: salesToday._sum.finalAmount || salesToday._sum.amount || 0,
      purchases: purchasesToday._sum.amount || 0,
      expenses: expensesToday._sum.amount || 0
    },
    month: {
      sales: salesMonth._sum.finalAmount || salesMonth._sum.amount || 0,
      purchases: purchasesMonth._sum.amount || 0,
      expenses: expensesMonth._sum.amount || 0
    },
    cashBalance: latestDayBook?.closingCashBalance || 0,
    bankBalance: latestDayBook?.closingBankBalance || 0,
    outstandingCredit: totalOutstandingCredit,
    totalToReceive,
    totalToPay
  };
}
