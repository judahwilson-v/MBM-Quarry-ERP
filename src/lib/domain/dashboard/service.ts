import { getDb } from "@/lib/prisma";

type LedgerBalanceRow = {
  id: string;
  partyId: string | null;
  partyName: string;
  balance: number;
  date: Date;
  createdAt: Date;
};

export function getDashboardDateRanges(now = new Date()) {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const monthStart = new Date(todayStart);
  monthStart.setDate(1);

  const nextMonthStart = new Date(monthStart);
  nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

  const sevenDayStart = new Date(todayStart);
  sevenDayStart.setDate(sevenDayStart.getDate() - 6);

  return { todayStart, tomorrowStart, monthStart, nextMonthStart, sevenDayStart };
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildSevenDayChart(
  sevenDayStart: Date,
  sales: Array<{ saleDate: Date; finalAmount: number }>,
  expenses: Array<{ expenseDate: Date; amount: number }>,
) {
  const salesByDay = new Map<string, number>();
  const expensesByDay = new Map<string, number>();

  for (const sale of sales) {
    const key = localDateKey(sale.saleDate);
    salesByDay.set(key, (salesByDay.get(key) ?? 0) + sale.finalAmount);
  }
  for (const expense of expenses) {
    const key = localDateKey(expense.expenseDate);
    expensesByDay.set(key, (expensesByDay.get(key) ?? 0) + expense.amount);
  }

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sevenDayStart);
    date.setDate(date.getDate() + index);
    const key = localDateKey(date);
    return {
      name: date.toLocaleDateString("en-IN", { weekday: "short" }),
      sales: salesByDay.get(key) ?? 0,
      expenses: expensesByDay.get(key) ?? 0,
      date: key,
    };
  });
}

export function summarizeLatestPartyBalances(rows: LedgerBalanceRow[]) {
  const seen = new Set<string>();
  let totalToReceive = 0;
  let totalToPay = 0;

  const newestFirst = [...rows].sort((left, right) => {
    const dateDelta = right.date.getTime() - left.date.getTime();
    if (dateDelta !== 0) return dateDelta;
    const createdDelta = right.createdAt.getTime() - left.createdAt.getTime();
    if (createdDelta !== 0) return createdDelta;
    return right.id.localeCompare(left.id);
  });

  for (const row of newestFirst) {
    const partyKey = row.partyId ?? `name:${row.partyName.trim().toLowerCase()}`;
    if (seen.has(partyKey)) continue;
    seen.add(partyKey);

    if (row.balance > 0) totalToReceive += row.balance;
    if (row.balance < 0) totalToPay += Math.abs(row.balance);
  }

  return { totalToReceive, totalToPay };
}

export async function getDashboardMetrics(now = new Date()) {
  const db = await getDb();
  const { todayStart, tomorrowStart, monthStart, nextMonthStart, sevenDayStart } = getDashboardDateRanges(now);

  const [
    salesToday,
    salesMonth,
    purchasesToday,
    purchasesMonth,
    expensesToday,
    expensesMonth,
    latestDayBook,
    ledgerRows,
    sevenDaySales,
    sevenDayExpenses,
  ] = await Promise.all([
    db.outgoingSale.aggregate({
      _sum: { finalAmount: true },
      where: { saleDate: { gte: todayStart, lt: tomorrowStart } },
    }),
    db.outgoingSale.aggregate({
      _sum: { finalAmount: true },
      where: { saleDate: { gte: monthStart, lt: nextMonthStart } },
    }),
    db.incomingBoulder.aggregate({
      _sum: { amount: true },
      where: { date: { gte: todayStart, lt: tomorrowStart } },
    }),
    db.incomingBoulder.aggregate({
      _sum: { amount: true },
      where: { date: { gte: monthStart, lt: nextMonthStart } },
    }),
    db.expense.aggregate({
      _sum: { amount: true },
      where: { expenseDate: { gte: todayStart, lt: tomorrowStart } },
    }),
    db.expense.aggregate({
      _sum: { amount: true },
      where: { expenseDate: { gte: monthStart, lt: nextMonthStart } },
    }),
    db.dayBook.findFirst({
      orderBy: [{ businessDate: "desc" }, { updatedAt: "desc" }],
      select: { businessDate: true, closingCashBalance: true, closingBankBalance: true },
    }),
    db.partyLedger.findMany({
      select: { id: true, partyId: true, partyName: true, balance: true, date: true, createdAt: true },
    }),
    db.outgoingSale.findMany({
      where: { saleDate: { gte: sevenDayStart, lt: tomorrowStart } },
      select: { saleDate: true, finalAmount: true },
    }),
    db.expense.findMany({
      where: { expenseDate: { gte: sevenDayStart, lt: tomorrowStart } },
      select: { expenseDate: true, amount: true },
    }),
  ]);

  const balances = summarizeLatestPartyBalances(ledgerRows);

  return {
    today: {
      sales: salesToday._sum.finalAmount ?? 0,
      purchases: purchasesToday._sum.amount ?? 0,
      expenses: expensesToday._sum.amount ?? 0,
    },
    month: {
      sales: salesMonth._sum.finalAmount ?? 0,
      purchases: purchasesMonth._sum.amount ?? 0,
      expenses: expensesMonth._sum.amount ?? 0,
    },
    cashBalance: latestDayBook?.closingCashBalance ?? 0,
    bankBalance: latestDayBook?.closingBankBalance ?? 0,
    balanceAsOf: latestDayBook?.businessDate ?? null,
    chartData: buildSevenDayChart(sevenDayStart, sevenDaySales, sevenDayExpenses),
    ...balances,
  };
}
