"use server";



import { Prisma } from "@prisma/client";
import { serialize } from "@/lib/utils/serialize";
import { getDb } from "@/lib/prisma";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { writeAuditEvent } from "@/lib/domain";
import { addDayBookExpense, recalculateDayBook, getOrCreateDayBook } from "@/lib/domain/daybook";
import { recalculatePartyLedger } from "@/lib/domain/ledger/party-ledger-service";
import { txAdjustInventoryStock } from "@/lib/domain/inventory/service";
import { verifyEditPassword } from "@/app/actions/auth";
import { validateWithSchema, IncomingBoulderInputSchema, DeleteIncomingBoulderSchema } from "@/lib/validators/schemas";
import { sanitizeError } from "@/lib/utils/sanitize-error";

export type IncomingBoulderInput = {
  id?: string;
  date: string;
  bookNumber?: string;
  pageNumber?: string;
  vehicleNumber: string;
  partyName: string;
  qty: string | number;
  rockRate?: string | number | null;
  cashPaid?: string | number | null;
  bankPaid?: string | number | null;
  gPayPaid?: string | number | null;
  vehicleRent?: string | number | null;
  combinedPayment?: boolean | null;
  time?: string | null;
  remarks?: string | null;
};

function normalizeVehicleNumber(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function cleanText(value?: string | null) {
  const text = value?.trim() ?? "";
  return text || null;
}

function parseDateInput(value?: string | Date | null) {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error("Date is invalid.");
  return date;
}

function containsSearch(row: Record<string, unknown>, search?: string) {
  const query = search?.trim().toLowerCase();
  if (!query) return true;
  return Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query));
}

async function upsertPartyByName(partyName: string) {
  const db = await getDb();
  const name = partyName.trim();
  if (!name) return;
  const existing = await db.party.findFirst({
    where: { partyName: { equals: name } },
    select: { id: true },
  });
  if (!existing) {
    return await db.party.create({ data: { partyName: name } });
  }
  return existing;
}

async function upsertVehicleByNumber(vehicleNumber: string, partyName?: string, partyId?: string | null, qty?: number | null) {
  const db = await getDb();
  const normalized = normalizeVehicleNumber(vehicleNumber);
  if (!normalized) return null;

  let existing = await db.vehicle.findUnique({
    where: { vehicleNumber: normalized },
  });

  if (!existing) {
    existing = await db.vehicle.create({
      data: {
        vehicleNumber: normalized,
        partyName: partyName || null,
        partyId: partyId || null,
        companyBodyQty: qty || null,
      },
    });
  } else {
    const updateData: any = {};
    if (partyName && !existing.partyName) updateData.partyName = partyName;
    if (partyId && !existing.partyId) updateData.partyId = partyId;
    if (qty && !existing.companyBodyQty && !existing.extraBodyQty) updateData.companyBodyQty = qty;

    if (Object.keys(updateData).length > 0) {
      existing = await db.vehicle.update({
        where: { id: existing.id },
        data: updateData,
      });
    }
  }
  return existing;
}

async function runTx<T>(txFn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const db = await getDb();
  try {
    return await db.$transaction(txFn);
  } finally {
    triggerAutoSync().catch(console.error);
  }
}


export async function listIncomingBoulder(search = "") {
  const db = await getDb();
  const rows = await db.incomingBoulder.findMany({ orderBy: [{ createdAt: "desc" }] });
  return serialize(rows.filter((row) => containsSearch(row, search)));
}


export async function saveIncomingBoulder(input: IncomingBoulderInput, pin?: string) {
  try {
    const validated = validateWithSchema(IncomingBoulderInputSchema, input);
    const qty = validated.qty;
    const rockRate = validated.rockRate ?? 26;
    const amount = qty * rockRate;
    const cashPaid = validated.cashPaid ?? 0;
    const bankPaid = validated.bankPaid ?? 0;
    const gPayPaid = validated.gPayPaid ?? 0;
    const vehicleRent = validated.vehicleRent ?? 0;
    const paidTotal = cashPaid + bankPaid + gPayPaid;
    const remainingCredit = amount - paidTotal;

    const bookNum = validated.bookNumber;
    const pageNum = validated.pageNumber;

    const data = {
      date: parseDateInput(validated.date),
      time: validated.time || null,
      bookNumber: bookNum ? Math.round(bookNum) : null,
      pageNumber: pageNum ? Math.round(pageNum) : null,
      vehicleNumber: "", // placeholder, will replace
      partyName: "", // placeholder
      materialName: "ROCK",
      qty,
      rockRate,
      amount,
      cashPaid,
      bankPaid,
      gPayPaid,
      vehicleRent,
      paidTotal,
      remainingCredit,
      combinedPayment: validated.combinedPayment || false,
      remarks: cleanText(validated.remarks),
    };
    const normalizedVehicle = normalizeVehicleNumber(cleanText(validated.vehicleNumber) ?? "");
    const partyName = cleanText(validated.partyName) ?? "";
    
    let partyId = null;
    if (partyName) {
      const party = await upsertPartyByName(partyName);
      partyId = party?.id || null;
    }
    
    const vehicle = await upsertVehicleByNumber(normalizedVehicle, partyName, partyId, qty);
    const vehicleId = vehicle?.id || null;

    data.vehicleNumber = normalizedVehicle;
    data.partyName = partyName;
    
    const finalData = { ...data, partyId, vehicleId };

    if (validated.id) {
      if (!pin) {
        throw new Error("Admin PIN is required to edit records.");
      }
      const isAuth = await verifyEditPassword(pin);
      if (!isAuth) {
        throw new Error("Invalid Admin PIN");
      }
      return serialize(await runTx(async (tx) => {
        const before = await tx.incomingBoulder.findUnique({ where: { id: validated.id! } });
        const row = await tx.incomingBoulder.update({ where: { id: validated.id! }, data: finalData });
        await writeAuditEvent(tx, { entityName: "IncomingBoulder", entityId: row.id, action: "update", role: "system", before, after: row });
        
        if (row.partyId) await recalculatePartyLedger(tx, row.partyId);

        // Handle Expense for immediate payment
        if (data.paidTotal > 0) {
          await addDayBookExpense(tx, {
            businessDate: data.date.toISOString(),
            expenseType: "MISCELLANEOUS",
            amount: data.paidTotal,
            description: `Paid for Boulder Purchase (${row.vehicleNumber}) - ${data.partyName}`
          });
        }

        // Sync inventory
        const qtyDiff = row.qty - (before?.qty ?? 0);
        if (qtyDiff !== 0) {
          await txAdjustInventoryStock(tx, "ROCK", qtyDiff, 'PRODUCTION_IN', row.id, `Boulder Purchase Updated: ${row.vehicleNumber}`);
        }

        return row;
      }));
    }
    return serialize(await runTx(async (tx) => {
      const row = await tx.incomingBoulder.create({ data: finalData });
      await writeAuditEvent(tx, { entityName: "IncomingBoulder", entityId: row.id, action: "create", role: "system", after: row });
      
      if (row.partyId) await recalculatePartyLedger(tx, row.partyId);

      // Handle Expense for immediate payment
      if (data.paidTotal > 0) {
        await addDayBookExpense(tx, {
          businessDate: data.date.toISOString(),
          expenseType: "MISCELLANEOUS",
          amount: data.paidTotal,
          description: `Paid for Boulder Purchase (${row.vehicleNumber}) - ${data.partyName}`
        });
      }

      // Add inventory
      await txAdjustInventoryStock(tx, "ROCK", row.qty, 'PRODUCTION_IN', row.id, `Boulder Purchase: ${row.vehicleNumber}`);

      return row;
    }));
  } catch (error) {
    throw new Error(sanitizeError(error));
  }
}


export async function deleteIncomingBoulder(id: string, pin?: string) {
  try {
    validateWithSchema(DeleteIncomingBoulderSchema, { id, pin });
    if (!pin) {
      throw new Error("Admin/Delete PIN is required to delete records.");
    }
    const isAuth = await verifyEditPassword(pin, "delete");
    if (!isAuth) {
      throw new Error("Invalid PIN");
    }

    await runTx(async (tx) => {
      const before = await tx.incomingBoulder.findUnique({ where: { id } });
      await tx.incomingBoulder.delete({ where: { id } });
      if (before) {
        await writeAuditEvent(tx, { entityName: "IncomingBoulder", entityId: id, action: "delete", role: "system", before });
        if (before.partyId) await recalculatePartyLedger(tx, before.partyId);

        // Revert inventory
        await txAdjustInventoryStock(tx, "ROCK", -before.qty, 'PRODUCTION_IN', id, `Boulder Purchase Deleted: ${before.vehicleNumber}`);
        
        // Cascade delete associated daybook expense
        const expenseDesc = `Paid for Boulder Purchase (${before.vehicleNumber}) - ${before.partyName}`;
        const expenses = await tx.dayBookExpenseEntry.findMany({ where: { description: expenseDesc } });
        if (expenses.length > 0) {
          await tx.dayBookExpenseEntry.deleteMany({ where: { description: expenseDesc } });
          const sourceEventIds = expenses.map((e: any) => e.sourceEventId);
          await tx.financialEvent.deleteMany({ where: { eventId: { in: sourceEventIds } } });
        }

        const dayBook = await getOrCreateDayBook(tx, before.date.toISOString());
        await recalculateDayBook(tx, dayBook);
      }
    });
  } catch (error) {
    throw new Error(sanitizeError(error));
  }
}


