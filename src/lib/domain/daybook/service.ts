import type { Prisma } from "@prisma/client";
import { emitFinancialEvent } from "@/lib/domain/financial-events";
import { projectDayBookExpense } from "./projector";
import type { DayBookExpenseInput, DayBookOpeningBalanceInput } from "./types";

type DayBookRecord = {
  id: string;
  businessDate: Date;
  openingCashBalance: number;
  openingBankBalance: number;
};

function startOfBusinessDay(value: string) {
  const dateStr = value.includes("T") ? value.split("T")[0] : value;
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error("Business date is invalid.");
  return date;
}


async function getOrCreateDayBook(tx: Prisma.TransactionClient, businessDate: string) {
  const day = startOfBusinessDay(businessDate);
  const existing = await tx.dayBook.findUnique({ where: { businessDate: day } });
  if (existing) return existing;
  return tx.dayBook.create({
    data: {
      businessDate: day,
      openingCashBalance: 0,
      openingBankBalance: 0,
      cashSalesTotal: 0,
      bankSalesTotal: 0,
      gPaySalesTotal: 0,
      expenseTotal: 0,
      closingCashBalance: 0,
      closingBankBalance: 0,
    },
  });
}

export async function recalculateDayBook(tx: Prisma.TransactionClient, dayBook: DayBookRecord) {
  const sales = await tx.ledgerEntry.findMany({
    where: { entryDate: dayBook.businessDate, eventType: "SALE_CREATED" },
  });
  const expenses = await tx.dayBookExpenseEntry.findMany({
    where: { dayBookId: dayBook.id },
  });

  const cashSalesTotal = sales.reduce((sum, entry) => sum + entry.cashAmount, 0);
  const bankSalesTotal = sales.reduce((sum, entry) => sum + entry.bankAmount, 0);
  const gPaySalesTotal = sales.reduce((sum, entry) => sum + entry.gPayAmount, 0);
  const expenseTotal = expenses.reduce((sum, entry) => sum + entry.amount, 0);
  const closingCashBalance = dayBook.openingCashBalance + cashSalesTotal - expenseTotal;
  const closingBankBalance = dayBook.openingBankBalance + bankSalesTotal + gPaySalesTotal;

  return tx.dayBook.update({
    where: { id: dayBook.id },
    data: {
      cashSalesTotal,
      bankSalesTotal,
      gPaySalesTotal,
      expenseTotal,
      closingCashBalance,
      closingBankBalance,
    },
  });
}

export async function setDayBookOpeningBalances(
  tx: Prisma.TransactionClient,
  input: DayBookOpeningBalanceInput,
) {
  const day = startOfBusinessDay(input.businessDate);
  const dayBook = await tx.dayBook.upsert({
    where: { businessDate: day },
    update: {
      openingCashBalance: input.openingCashBalance,
      openingBankBalance: input.openingBankBalance,
    },
    create: {
      businessDate: day,
      openingCashBalance: input.openingCashBalance,
      openingBankBalance: input.openingBankBalance,
      cashSalesTotal: 0,
      bankSalesTotal: 0,
      gPaySalesTotal: 0,
      expenseTotal: 0,
      closingCashBalance: input.openingCashBalance,
      closingBankBalance: input.openingBankBalance,
    },
  });
  return recalculateDayBook(tx, dayBook);
}

export async function addDayBookExpense(
  tx: Prisma.TransactionClient,
  input: DayBookExpenseInput,
) {
  const dayBook = await getOrCreateDayBook(tx, input.businessDate);
  const financialEvent = await emitFinancialEvent(tx, {
    correlationId: dayBook.id,
    eventType: "DAY_BOOK_EXPENSE_CREATED",
    entityType: "DayBookExpense",
    entityId: dayBook.id,
    payload: {
      dayBookId: dayBook.id,
      businessDate: input.businessDate,
      expenseType: input.expenseType,
      amount: input.amount,
      description: input.description ?? null,
    },
  });
  const projected = projectDayBookExpense(financialEvent);
  await tx.dayBookExpenseEntry.upsert({
    where: { sourceEventId: projected.sourceEventId },
    update: projected,
    create: projected,
  });
  return recalculateDayBook(tx, dayBook);
}

export async function rebuildDayBook(tx: Prisma.TransactionClient, businessDate?: string) {
  const where = businessDate ? { businessDate: startOfBusinessDay(businessDate) } : {};
  const dayBooks = await tx.dayBook.findMany({ where });
  for (const dayBook of dayBooks) {
    await recalculateDayBook(tx, dayBook);
  }
  return dayBooks.length;
}
