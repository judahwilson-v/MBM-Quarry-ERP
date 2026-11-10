import type { Prisma } from "@prisma/client";
import { emitFinancialEvent } from "@/lib/domain/financial-events";
import { projectDayBookExpense } from "./projector";
import type { DayBookExpenseInput, DayBookOpeningBalanceInput } from "./types";
import { paymentCashBook } from "./payment-summary";
import { businessDateKey, businessDayBounds } from "./business-date";

type DayBookRecord = {
  id: string;
  businessDate: Date;
  openingCashBalance: number;
  openingBankBalance: number;
};

export async function getOrCreateDayBook(tx: Prisma.TransactionClient, businessDate: string | Date) {
  const day = businessDateKey(businessDate);
  const existing = await tx.dayBook.findUnique({ where: { businessDate: day } });
  if (existing) return existing;
  // Match the reader's exact-previous-day default only at first creation.
  // An existing explicit opening is never recomputed or cascaded.
  const previousDay = new Date(day);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  const previous = await tx.dayBook.findUnique({ where: { businessDate: previousDay } });
  const openingCashBalance = previous?.closingCashBalance ?? 0;
  const openingBankBalance = previous?.closingBankBalance ?? 0;
  return tx.dayBook.create({
    data: {
      businessDate: day,
      openingCashBalance,
      openingBankBalance,
      cashSalesTotal: 0,
      bankSalesTotal: 0,
      gPaySalesTotal: 0,
      expenseTotal: 0,
      closingCashBalance: openingCashBalance,
      closingBankBalance: openingBankBalance,
    },
  });
}

export async function recalculateDayBook(tx: Prisma.TransactionClient, dayBook: DayBookRecord) {
  const label = dayBook.businessDate.toISOString().slice(0, 10);
  const { start, endExclusive } = businessDayBounds(label);
  // Do not reinterpret legacy noncanonical stored keys as a data migration.
  const canonical = dayBook.businessDate.getUTCHours() === 0 &&
    dayBook.businessDate.getUTCMinutes() === 0 && dayBook.businessDate.getUTCSeconds() === 0 &&
    dayBook.businessDate.getUTCMilliseconds() === 0;
  const sales = await tx.ledgerEntry.findMany({
    where: { entryDate: canonical ? { gte: start, lt: endExclusive } : dayBook.businessDate, eventType: "SALE_CREATED" },
  });
  const expenses = await tx.dayBookExpenseEntry.findMany({
    where: { dayBookId: dayBook.id },
  });

  const cashSalesTotal = sales.reduce((sum, entry) => sum + entry.cashAmount, 0);
  const bankSalesTotal = sales.reduce((sum, entry) => sum + entry.bankAmount, 0);
  const gPaySalesTotal = sales.reduce((sum, entry) => sum + entry.gPayAmount, 0);
  const expenseTotal = expenses.reduce((sum, entry) => sum + entry.amount, 0);
  const summary = await paymentCashBook(tx, label, dayBook.openingCashBalance, dayBook.openingBankBalance, dayBook.id, cashSalesTotal, bankSalesTotal + gPaySalesTotal);
  if (!summary.available) throw new Error(summary.unresolved.join("; "));
  const closingCashBalance = summary.closingCash;
  const closingBankBalance = summary.closingBank;

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
  const day = businessDateKey(input.businessDate);
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
      ...(input.sourceKind ? { sourceKind: input.sourceKind } : {}),
      ...(input.sourceEntityId ? { sourceEntityId: input.sourceEntityId } : {}),
      ...(input.paymentMode ? { paymentMode: input.paymentMode } : {}),
      ...(input.paymentBreakdown ? { paymentBreakdown: input.paymentBreakdown } : {}),
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
  const where = businessDate ? { businessDate: businessDateKey(businessDate) } : {};
  const dayBooks = await tx.dayBook.findMany({ where });
  for (const dayBook of dayBooks) {
    await recalculateDayBook(tx, dayBook);
  }
  return dayBooks.length;
}
