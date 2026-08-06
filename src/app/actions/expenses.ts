"use server";



import { Prisma } from "@prisma/client";
import { serialize } from "@/lib/utils/serialize";
import { getDb } from "@/lib/prisma";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { writeAuditEvent } from "@/lib/domain";
import { emitFinancialEvent } from "@/lib/domain/financial-events";
import { projectDayBookExpense, recalculateDayBook, getOrCreateDayBook } from "@/lib/domain/daybook";
import { verifyEditPassword } from "@/app/actions/auth";
import { validateWithSchema, ExpenseInputSchema, DeleteExpenseSchema } from "@/lib/validators/schemas";
import { sanitizeError } from "@/lib/utils/sanitize-error";

function normalizeVehicleNumber(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

async function runTx<T>(txFn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const db = await getDb();
  try {
    return await db.$transaction(txFn);
  } finally {
    triggerAutoSync().catch(console.error);
  }
}


export async function listExpenses() {
  const db = await getDb();
  const rows = await db.expense.findMany({
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
  });
  return serialize(rows);
}


export async function saveExpense(input: any) {
  try {
    const validated = validateWithSchema(ExpenseInputSchema, input);
    const amount = validated.amount;
    
    return serialize(await runTx(async (tx: Prisma.TransactionClient) => {
      let partyId = validated.partyId;
      let partyName = validated.partyName;
      if (partyName) {
        partyName = partyName.trim();
        let party = await tx.party.findFirst({ where: { partyName: { equals: partyName } } });
        if (!party) party = await tx.party.create({ data: { partyName } });
        partyId = party.id;
      }

      let vehicleId = validated.vehicleId;
      let vehicleNumber = validated.vehicleNumber;
      if (vehicleNumber) {
        vehicleNumber = normalizeVehicleNumber(vehicleNumber);
        let vehicle = await tx.vehicle.findFirst({ where: { vehicleNumber: { equals: vehicleNumber } } });
        if (!vehicle) vehicle = await tx.vehicle.create({ data: { vehicleNumber } });
        vehicleId = vehicle.id;
      }

      const data = {
        expenseDate: validated.expenseDate ? new Date(validated.expenseDate) : new Date(),
        expenseType: validated.expenseType,
        amount,
        paymentMode: validated.paymentMode || "CASH",
        partyId: partyId || null,
        partyName: partyName || null,
        vehicleId: vehicleId || null,
        vehicleNumber: vehicleNumber || null,
        description: validated.description ?? null,
      };

      if (validated.id) {
        const before = await tx.expense.findUnique({ where: { id: validated.id } });
        const row = await tx.expense.update({ where: { id: validated.id }, data });
        
        const financialEvent = await tx.financialEvent.findFirst({ where: { entityId: validated.id } });
        if (financialEvent) {
          const updatedEvent = await tx.financialEvent.update({
            where: { id: financialEvent.id },
            data: { payload: { ...data, expenseDate: data.expenseDate.toISOString() } }
          });
          
          // Update DayBook
          const businessDateStr = data.expenseDate.toISOString().split("T")[0];
          
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

          const projected = projectDayBookExpense(updatedEvent, dayBook.id);
          await tx.dayBookExpenseEntry.upsert({
            where: { sourceEventId: projected.sourceEventId },
            update: projected,
            create: projected,
          });
          await recalculateDayBook(tx, dayBook);
        }
        
        await writeAuditEvent(tx, { entityName: "Expense", entityId: row.id, action: "update", role: "system", before, after: row });
        return row;
      }

      const eventId = crypto.randomUUID();
      const row = await tx.expense.create({
        data: { ...data, sourceEventId: eventId }
      });

      const financialEvent = await emitFinancialEvent(tx, {
        correlationId: row.id,
        eventType: "EXPENSE_CREATED",
        entityType: "Expense",
        entityId: row.id,
        payload: { ...data, expenseDate: data.expenseDate.toISOString() }
      });

      // Update DayBook with this expense
      const businessDateStr = data.expenseDate.toISOString().split("T")[0];
      
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

      await writeAuditEvent(tx, { entityName: "Expense", entityId: row.id, action: "create", role: "system", before: null, after: row });
      return row;
    }));
  } catch (error) {
    throw new Error(sanitizeError(error));
  }
}


export async function deleteExpense(id: string, pin?: string) {
  try {
    validateWithSchema(DeleteExpenseSchema, { id, pin });
    if (!pin || !(await verifyEditPassword(pin, "delete"))) {
      throw new Error("Invalid delete PIN");
    }
    return serialize(await runTx(async (tx: Prisma.TransactionClient) => {
      const row = await tx.expense.findUnique({ where: { id } });
      if (!row) throw new Error("Expense not found");

      const financialEvent = await tx.financialEvent.findFirst({ where: { entityId: id } });
      if (financialEvent) await tx.financialEvent.delete({ where: { id: financialEvent.id } });

      await tx.expense.delete({ where: { id } });

      // Clean up orphaned DayBookExpenseEntry records
      await tx.dayBookExpenseEntry.deleteMany({
        where: { sourceEventId: id }
      });

      const dayBook = await getOrCreateDayBook(tx, row.expenseDate.toISOString());
      await recalculateDayBook(tx, dayBook);

      await writeAuditEvent(tx, { entityName: "Expense", entityId: id, action: "delete", role: "system", before: row, after: null });
      return row;
    }));
  } catch (error) {
    throw new Error(sanitizeError(error));
  }
}


