import { getDb } from "@/lib/prisma";

export async function getDashboardMetrics() {
  // Local SQLite (Runs on Quarry PC)
  const db = await getDb();
  
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const today = new Date(`${todayStr}T00:00:00.000Z`);
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  const [
    salesToday,
    salesMonth,
    purchasesToday,
    purchasesMonth,
    expensesToday,
    expensesMonth,
    latestDayBook,
    parties,
    sevenDaySales,
    sevenDayExpenses
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
    }),
    db.outgoingSale.findMany({
      where: { saleDate: { gte: sevenDaysAgo } },
      select: { saleDate: true, finalAmount: true, amount: true }
    }),
    db.expense.findMany({
      where: { expenseDate: { gte: sevenDaysAgo } },
      select: { expenseDate: true, amount: true }
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

  // Generate 7-day chart data
  const chartData = [];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenDaysAgo);
    d.setDate(d.getDate() + i);
    const dayStr = d.toISOString().split('T')[0];
    
    const daySales = sevenDaySales.filter((s: any) => s.saleDate.toISOString().split('T')[0] === dayStr)
      .reduce((sum: number, s: any) => sum + (s.finalAmount || s.amount || 0), 0);
      
    const dayExpenses = sevenDayExpenses.filter((e: any) => e.expenseDate.toISOString().split('T')[0] === dayStr)
      .reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

    chartData.push({
      name: days[d.getDay()],
      sales: daySales,
      expenses: dayExpenses,
      date: dayStr
    });
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
    totalToPay,
    chartData
  };
}
