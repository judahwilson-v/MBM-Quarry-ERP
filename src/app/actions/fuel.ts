"use server";



import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/prisma";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { writeAuditEvent } from "@/lib/domain";
import { emitFinancialEvent } from "@/lib/domain/financial-events";
import { projectDayBookExpense, recalculateDayBook } from "@/lib/domain/daybook";

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

function parseDateInput(value?: string | null) {
  if (!value) return new Date();
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error("Date is invalid.");
  return date;
}

async function runTx<T>(txFn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const db = await getDb();
  try {
    return await db.$transaction(txFn);
  } finally {
    // Fire-and-forget: don't block the server action response with sync
    setTimeout(() => triggerAutoSync().catch(console.error), 0);
  }
}


export async function listFuelPurchases() {
  const db = await getDb();
  const rows = await db.fuelPurchase.findMany({
    orderBy: { date: "desc" },
    include: { vehicle: true }
  });
  return serialize(rows);
}


export async function saveFuelPurchase(input: any) {
  const amount = parseNumber(input.amount, "Amount") || 0;
  const paidAmount = parseNumber(input.paidAmount, "Paid Amount", false) || 0;
  const creditAmount = amount - paidAmount;
  
  const pricePerLitre = parseNumber(input.pricePerLitre, "Price per litre", false) ?? null;
  const qtyLitre = parseNumber(input.qtyLitre, "Quantity", false) ?? null;
  const date = parseDateInput(input.date);
  
  const data = {
    date,
    fuelType: input.fuelType,
    pricePerLitre,
    qtyLitre,
    amount,
    paidAmount,
    creditAmount,
    isCan: input.isCan,
    vehicleId: input.vehicleId || null,
    vehicleNumber: input.vehicleNumber || null,
  };

  return serialize(await runTx(async (tx) => {
    let row;
    if (input.id) {
      const before = await tx.fuelPurchase.findUnique({ where: { id: input.id } });
      row = await tx.fuelPurchase.update({ where: { id: input.id }, data });
      await writeAuditEvent(tx, { entityName: "FuelPurchase", entityId: row.id, action: "update", role: "system", before, after: row });
      
      const expense = await tx.expense.findUnique({ where: { sourceEventId: before!.sourceEventId } });
      if (expense) {
        await tx.expense.update({
          where: { id: expense.id },
          data: {
            expenseDate: date,
            amount: paidAmount > 0 ? paidAmount : amount,
            vehicleId: input.vehicleId || null,
            vehicleNumber: input.vehicleNumber || null,
          }
        });
        
        const businessDateStr = date.toISOString().split("T")[0];
        const day = new Date(`${businessDateStr}T00:00:00`);
        const dayBook = await tx.dayBook.findUnique({ where: { businessDate: day } });
        if (dayBook) {
          const financialEvent = await tx.financialEvent.findFirst({ where: { entityId: expense.id } });
          if (financialEvent) {
             const newPayload = { ...financialEvent.payload as any, amount: paidAmount > 0 ? paidAmount : amount, expenseDate: date.toISOString() };
             await tx.financialEvent.update({ where: { id: financialEvent.id }, data: { payload: newPayload } });
             const projected = projectDayBookExpense({ ...financialEvent, payload: newPayload }, dayBook.id);
             await tx.dayBookExpenseEntry.upsert({
               where: { sourceEventId: projected.sourceEventId },
               update: projected,
               create: projected,
             });
             await recalculateDayBook(tx, dayBook);
          }
        }
      }
    } else {
      const eventId = crypto.randomUUID();
      row = await tx.fuelPurchase.create({
        data: { ...data, sourceEventId: eventId }
      });
      await writeAuditEvent(tx, { entityName: "FuelPurchase", entityId: row.id, action: "create", role: "system", before: null, after: row });

      // Automatically push to Expense
      const expenseAmount = paidAmount > 0 ? paidAmount : amount;
      const expenseRow = await tx.expense.create({
        data: {
          expenseDate: date,
          expenseType: input.fuelType,
          amount: expenseAmount,
          paymentMode: "CASH",
          vehicleId: input.vehicleId || null,
          vehicleNumber: input.vehicleNumber || null,
          description: `Fuel Purchase ${input.isCan ? '(CAN)' : ''}`,
          sourceEventId: eventId
        }
      });
      
      const financialEvent = await emitFinancialEvent(tx, {
        correlationId: expenseRow.id,
        eventType: "EXPENSE_CREATED",
        entityType: "Expense",
        entityId: expenseRow.id,
        payload: { ...expenseRow, expenseDate: date.toISOString() }
      });

      const businessDateStr = date.toISOString().split("T")[0];
      const day = new Date(`${businessDateStr}T00:00:00`);
      let dayBook = await tx.dayBook.findUnique({ where: { businessDate: day } });
      if (!dayBook) {
        dayBook = await tx.dayBook.create({
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

      const projected = projectDayBookExpense(financialEvent, dayBook.id);
      await tx.dayBookExpenseEntry.upsert({
        where: { sourceEventId: projected.sourceEventId },
        update: projected,
        create: projected,
      });
      await recalculateDayBook(tx, dayBook);
    }

    return row;
  }));
}


export async function deleteFuelPurchase(id: string) {
  return serialize(await runTx(async (tx: Prisma.TransactionClient) => {
    const row = await tx.fuelPurchase.findUnique({ where: { id } });
    if (!row) throw new Error("Fuel purchase not found");
    
    const expense = await tx.expense.findUnique({ where: { sourceEventId: row.sourceEventId } });
    if (expense) {
      const financialEvent = await tx.financialEvent.findFirst({ where: { entityId: expense.id } });
      if (financialEvent) {
        await tx.financialEvent.delete({ where: { id: financialEvent.id } });
        await tx.dayBookExpenseEntry.deleteMany({ where: { sourceEventId: financialEvent.eventId } });
      }
      await tx.expense.delete({ where: { id: expense.id } });
    }
    
    await tx.fuelPurchase.delete({ where: { id } });
    await writeAuditEvent(tx, { entityName: "FuelPurchase", entityId: id, action: "delete", role: "system", before: row, after: null });
    return row;
  }));
}

export type EmployeeInput = {
  id?: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  role?: string;
};


