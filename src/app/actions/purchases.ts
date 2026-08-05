"use server";



import { getDb } from "@/lib/prisma";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { writeAuditEvent } from "@/lib/domain";
import { addDayBookExpense, recalculateDayBook, getOrCreateDayBook } from "@/lib/domain/daybook";
import { recalculatePartyLedger } from "@/lib/domain/ledger/party-ledger-service";
import { txAdjustInventoryStock } from "@/lib/domain/inventory/service";




type IncomingBoulderInput = {
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

function normalizeVehicleNumber(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}


function cleanText(value?: string | null) {
  const text = value?.trim() ?? "";
  return text || null;
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


async function runTx<T>(txFn: (tx: any) => Promise<T>): Promise<T> {
  try {
    return await runTx(txFn);
  } finally {
    triggerAutoSync().catch(console.error);
  }
}


export async function listIncomingBoulder(search = "") {
  const db = await getDb();
  const rows = await db.incomingBoulder.findMany({ orderBy: [{ createdAt: "desc" }] });
  return serialize(rows.filter((row) => containsSearch(row, search)));
}


export async function saveIncomingBoulder(input: IncomingBoulderInput) {
  const qty = parseNumber(input.qty, "Qty") ?? 0;
  const rockRate = parseNumber(input.rockRate, "Rock Rate") ?? 26;
  const amount = qty * rockRate;
  const cashPaid = parseNumber(input.cashPaid, "Cash paid") ?? 0;
  const bankPaid = parseNumber(input.bankPaid, "Bank paid") ?? 0;
  const gPayPaid = parseNumber(input.gPayPaid, "GPay paid") ?? 0;
  const vehicleRent = parseNumber(input.vehicleRent, "Vehicle rent") ?? 0;
  const paidTotal = cashPaid + bankPaid + gPayPaid;
  const remainingCredit = amount - paidTotal;

  const bookNum = parseNumber(input.bookNumber, "Book", false);
  const pageNum = parseNumber(input.pageNumber, "Page", false);

  const data = {
    date: parseDateInput(input.date),
    time: input.time || null,
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
    combinedPayment: input.combinedPayment || false,
    remarks: cleanText(input.remarks),
  };
  const normalizedVehicle = normalizeVehicleNumber(cleanText(input.vehicleNumber) ?? "");
  const partyName = cleanText(input.partyName) ?? "";
  
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

  if (input.id) {
    return serialize(await runTx(async (tx) => {
      const before = await tx.incomingBoulder.findUnique({ where: { id: input.id } });
      const row = await tx.incomingBoulder.update({ where: { id: input.id }, data: finalData });
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
}


export async function deleteIncomingBoulder(id: string) {
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
}


