"use server";



import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/prisma";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { addDayBookExpense, rebuildDayBook, setDayBookOpeningBalances } from "@/lib/domain/daybook";

const dateTimeKeys = new Set(["createdAt", "updatedAt", "saleDate", "date", "expectedDueDate"]);

function serialize<T>(value: T): T {
  if (value instanceof Date) { try { return value.toISOString() as T; } catch { return null as unknown as T; } }
  if (Array.isArray(value)) return value.map((item) => serialize(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        entry instanceof Date || dateTimeKeys.has(key) ? serialize(entry) : serialize(entry),
      ]),
    ) as T;
  }
  return value;
}

function parseNumber(value: string | number | null | undefined, label: string, required = true) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new Error(`${label} is required.`);
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a valid number.`);
  return number;
}

function dateOnly(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

async function runTx<T>(txFn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const db = await getDb();
  try {
    return await db.$transaction(txFn);
  } finally {
    triggerAutoSync().catch(console.error);
  }
}

export async function getTodayForInput() {
  return dateOnly(new Date());
}

export async function saveDayBookOpeningBalances(input: any) {
  const openingCashBalance = parseNumber(input.openingCashBalance, "Opening cash balance") ?? 0;
  const openingBankBalance = parseNumber(input.openingBankBalance, "Opening bank balance") ?? 0;
  return serialize(
    await runTx(async (tx: Prisma.TransactionClient) => setDayBookOpeningBalances(tx, {
      businessDate: input.businessDate,
      openingCashBalance,
      openingBankBalance,
    })),
  );
}

export async function saveDayBookExpense(input: any) {
  const amount = parseNumber(input.amount, "Expense amount") ?? 0;
  if (amount <= 0) throw new Error("Expense amount must be greater than 0.");
  return serialize(
    await runTx(async (tx: Prisma.TransactionClient) => addDayBookExpense(tx, {
      businessDate: input.businessDate,
      expenseType: input.expenseType,
      amount,
      description: input.description,
    })),
  );
}

export async function rebuildBusinessDayBook(businessDate?: string) {
  return serialize(await runTx(async (tx: Prisma.TransactionClient) => rebuildDayBook(tx, businessDate)));
}


