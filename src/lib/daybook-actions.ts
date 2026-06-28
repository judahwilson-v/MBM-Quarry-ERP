"use server";

import { getDb } from "./prisma";
// removed unused imports
function getDayBounds(dateString?: string) {
  const d = dateString ? new Date(dateString) : new Date();
  
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
}

function getBusinessDate(dateString?: string) {
  const d = dateString ? new Date(dateString) : new Date();
  const dateStr = d.toISOString().split("T")[0];
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export async function fetchDayBookData(dateString?: string) {
  const db = await getDb();
  const { start, end } = getDayBounds(dateString);
  const businessDate = getBusinessDate(dateString);

  // 1. Opening Balances
  let dayBook = await db.dayBook.findUnique({
    where: { businessDate },
  });

  if (!dayBook) {
    // Check for previous day's closing balance to use as default opening
    const prevDay = new Date(businessDate);
    prevDay.setDate(prevDay.getDate() - 1);
    const prevDayBook = await db.dayBook.findUnique({
      where: { businessDate: prevDay },
    });
    
    dayBook = {
      openingCashBalance: prevDayBook?.closingCashBalance || 0,
      openingBankBalance: prevDayBook?.closingBankBalance || 0,
    } as any;
  }

  // 2. Sales
  const sales = await db.outgoingSale.findMany({
    where: { saleDate: { gte: start, lte: end } },
  });
  
  let cashSales = 0;
  let bankSales = 0;
  let creditSales = 0;
  
  sales.forEach(sale => {
    cashSales += sale.cashPaid || 0;
    bankSales += (sale.bankPaid || 0) + (sale.gPayPaid || 0);
    creditSales += sale.remainingCredit || 0;
  });

  // 3. Party Collections
  const collections = await db.partyCollection.findMany({
    where: { collectionDate: { gte: start, lte: end } },
  });

  let cashCollections = 0;
  let bankCollections = 0;

  collections.forEach(c => {
    cashCollections += c.cashPaid || 0;
    bankCollections += (c.bankPaid || 0) + (c.gPayPaid || 0);
  });

  // 4. Expenses
  // We look up the dayBook object if it exists to find expenses
  let expenses: any[] = [];
  if (dayBook && dayBook.id) {
    expenses = await db.dayBookExpenseEntry.findMany({
      where: { dayBookId: dayBook.id },
    });
  }

  let dieselExp = 0;
  let labourExp = 0;
  let vehicleExp = 0;
  let otherExp = 0;
  let cashExp = 0; // Assuming all expenses are cash for now

  expenses.forEach(e => {
    cashExp += e.amount;
    const type = e.expenseType.toLowerCase();
    if (type.includes("diesel")) dieselExp += e.amount;
    else if (type.includes("labour")) labourExp += e.amount;
    else if (type.includes("vehicle")) vehicleExp += e.amount;
    else otherExp += e.amount;
  });

  // 5. Transfers
  const transfers = await db.cashTransfer.findMany({
    where: { date: { gte: start, lte: end } },
  });

  let cashToBank = 0;
  let bankToCash = 0;

  transfers.forEach(t => {
    if (t.type === "CASH_TO_BANK") cashToBank += t.amount;
    else if (t.type === "BANK_TO_CASH") bankToCash += t.amount;
  });

  // 6. Calculate Closings
  const closingCash = (dayBook?.openingCashBalance || 0) + cashSales + cashCollections + bankToCash - cashExp - cashToBank;
  const closingBank = (dayBook?.openingBankBalance || 0) + bankSales + bankCollections + cashToBank - bankToCash;

  return JSON.parse(JSON.stringify({
    openingCash: dayBook?.openingCashBalance || 0,
    openingBank: dayBook?.openingBankBalance || 0,
    cashSales,
    bankSales,
    creditSales,
    cashCollections,
    bankCollections,
    dieselExp,
    labourExp,
    vehicleExp,
    otherExp,
    cashExp,
    cashToBank,
    bankToCash,
    closingCash,
    closingBank,
    expenses,
    transfers
  }));
}

export async function saveCashTransfer(data: { type: string; amount: number; time: string; date: string; remarks: string; userName: string }) {
  const db = await getDb();
  await db.cashTransfer.create({
    data: {
      type: data.type,
      amount: Number(data.amount),
      time: data.time,
      date: new Date(data.date),
      remarks: data.remarks,
      userName: data.userName,
    }
  });
  
  // Create audit log
  await db.auditLog.create({
    data: {
      entityName: "DayBook",
      entityId: "transfer",
      action: "transfer_created",
      payload: JSON.stringify({
        userName: data.userName,
        date: data.date,
        time: data.time,
        oldValue: 0,
        newValue: data.amount,
        action: data.type,
        module: "DayBook"
      })
    }
  });
}

export async function logDayBookAudit(data: { userName: string; date: string; time: string; oldValue: any; newValue: any; action: string; module: string }) {
  const db = await getDb();
  await db.auditLog.create({
    data: {
      entityName: "DayBook",
      entityId: "manual_edit",
      action: "manual_edit",
      payload: JSON.stringify(data)
    }
  });
}

export async function purgeOldAuditLogs() {
  const db = await getDb();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  await db.auditLog.deleteMany({
    where: {
      createdAt: { lt: oneMonthAgo }
    }
  });
}
