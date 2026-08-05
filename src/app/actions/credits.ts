"use server";



import { getDb } from "@/lib/prisma";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { deriveSalesEngine, type SalesDraft } from "@/lib/sales-engine";
import { calculateRemainingCredit, decrementVehicleTrips, incrementVehicleTrips, writeAuditEvent } from "@/lib/domain";
import { emitFinancialEvent } from "@/lib/domain/financial-events";
import { addDayBookExpense, rebuildDayBook, setDayBookOpeningBalances, projectDayBookExpense, recalculateDayBook, getOrCreateDayBook } from "@/lib/domain/daybook";
import { recalculatePartyLedger } from "@/lib/domain/ledger/party-ledger-service";
import { txAdjustInventoryStock } from "@/lib/domain/inventory/service";
import { verifyEditPassword } from "@/app/actions/auth";

type VehicleInput = {
  id?: string;
  vehicleNumber: string;
  partyName?: string | null;
  companyBodyQty?: string | number | null;
  extraBodyQty?: string | number | null;
};

type PartyInput = {
  id?: string;
  partyName: string;
  phone?: string | null;
  address?: string | null;
};

type SaleInput = SalesDraft & {
  id?: string;
  vehicleId?: string;
};

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

type EmployeeCreditInput = {
  id?: string;
  employeeName: string;
  amount: string | number;
  reason?: string | null;
  expectedDueDate?: string | null;
  status: string;
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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cleanText(value?: string | null) {
  const text = value?.trim() ?? "";
  return text || null;
}

function requiredText(value: string | null | undefined, label: string) {
  const text = value?.trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
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

function dateOnly(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
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
  const db = await getDb();
  try {
    return await db.$transaction(txFn);
  } finally {
    triggerAutoSync().catch(console.error);
  }
}


export async function listPartyCreditSummary() {
  const db = await getDb();
  const rows = await db.partyCredit.findMany({ orderBy: { partyName: "asc" } });
  const summary = new Map<string, { partyName: string; totalCredit: number; truckCount: number }>();

  for (const row of rows) {
    const current = summary.get(row.partyName) ?? { partyName: row.partyName, totalCredit: 0, truckCount: 0 };
    current.totalCredit = roundMoney(current.totalCredit + row.amount);
    current.truckCount += 1;
    summary.set(row.partyName, current);
  }

  return Array.from(summary.values()).sort((a, b) => a.partyName.localeCompare(b.partyName));
}


export async function listPartyCreditEntries(partyName: string) {
  const db = await getDb();
  const rows = await db.partyCredit.findMany({
    where: { partyName },
    orderBy: { createdAt: "desc" },
  });
  const sales = await db.outgoingSale.findMany({
    where: { id: { in: rows.map((row) => row.saleId) } },
  });
  const saleById = new Map(sales.map((sale) => [sale.id, sale]));
  return serialize(rows.map((row) => ({ ...row, sale: saleById.get(row.saleId) ?? null })));
}


export async function listPartyCollectionSummary() {
  const db = await getDb();
  const parties = await db.party.findMany();
  const summary = [];
  for (const p of parties) {
    summary.push({ partyName: p.partyName, outstanding: await getPartyOutstandingBalance(db, p.id) });
  }
  return summary;
}


export async function listPartyCollectionHistory(partyName: string) {
  const db = await getDb();
  const party = await db.party.findFirst({ where: { partyName } });
  if (!party) return [];
  const rows = await db.partyCollection.findMany({
    where: { partyId: party.id },
    orderBy: [{ collectionDate: "desc" }, { createdAt: "desc" }],
  });
  return serialize(rows);
}


export async function savePartyCollection(input: any) {
  const db = await getDb();
  const partyName = (input.partyName || "").trim();
  const cashPaid = parseNumber(input.cashPaid ?? 0, "Cash paid", false) ?? 0;
  const bankPaid = parseNumber(input.bankPaid ?? 0, "Bank paid", false) ?? 0;
  const gPayPaid = parseNumber(input.gPayPaid ?? 0, "GPay paid", false) ?? 0;
  const totalAmount = roundMoney(cashPaid + bankPaid + gPayPaid);
  if (totalAmount <= 0) throw new Error("Collection amount must be greater than 0.");
  const collectionDate = input.collectionDate ? new Date(input.collectionDate) : new Date();

  return serialize(
    await runTx(async (tx: any) => {
      const party = await tx.party.findFirst({ where: { partyName: { equals: partyName } } });
      if (!party) throw new Error("Party not found.");
      
      const collection = await tx.partyCollection.create({
        data: {
          partyId: party.id,
          partyName,
          collectionDate,
          cashPaid,
          bankPaid,
          gPayPaid,
          totalAmount,
          remarks: input.remarks,
          sourceEventId: "temp-" + Date.now() + "-" + Math.random(),
        }
      });
      
      const financialEvent = await emitFinancialEvent(tx, {
        correlationId: collection.id,
        eventType: "PARTY_COLLECTION_CREATED",
        entityType: "PartyCollection",
        entityId: collection.id,
        payload: {
          partyId: party.id,
          partyName,
          collectionDate: collectionDate.toISOString(),
          cashPaid,
          bankPaid,
          gPayPaid,
          totalAmount,
          remarks: input.remarks,
        },
      });
      
      await tx.partyCollection.update({
        where: { id: collection.id },
        data: { sourceEventId: financialEvent.eventId }
      });
      
      await recalculatePartyLedger(tx, party.id);
      return financialEvent;
    }),
  );
}

async function getPartyOutstandingBalance(tx: any, partyId: string) {
  const ledger = await tx.partyLedger.findFirst({
    where: { partyId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }]
  });
  return ledger ? ledger.balance : 0;
}


export async function savePartyPayment(input: any) {
  const db = await getDb();
  const partyName = (input.partyName || "").trim();
  const cashPaid = parseNumber(input.cashPaid ?? 0, "Cash paid", false) ?? 0;
  const bankPaid = parseNumber(input.bankPaid ?? 0, "Bank paid", false) ?? 0;
  const gPayPaid = parseNumber(input.gPayPaid ?? 0, "GPay paid", false) ?? 0;
  const totalAmount = roundMoney(cashPaid + bankPaid + gPayPaid);
  if (totalAmount <= 0) throw new Error("Payment amount must be greater than 0.");
  const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();

  return serialize(
    await runTx(async (tx: any) => {
      const party = await tx.party.findFirst({ where: { partyName: { equals: partyName } } });
      if (!party) throw new Error("Party not found.");
      
      const payment = await tx.partyPayment.create({
        data: {
          partyId: party.id,
          partyName,
          paymentDate,
          cashPaid,
          bankPaid,
          gPayPaid,
          totalAmount,
          remarks: input.remarks,
          sourceEventId: "temp-" + Date.now() + "-" + Math.random(),
        }
      });
      
      const financialEvent = await emitFinancialEvent(tx, {
        correlationId: payment.id,
        eventType: "PARTY_PAYMENT_CREATED",
        entityType: "PartyPayment",
        entityId: payment.id,
        payload: {
          partyId: party.id,
          partyName,
          paymentDate: paymentDate.toISOString(),
          cashPaid,
          bankPaid,
          gPayPaid,
          totalAmount,
          remarks: input.remarks,
        },
      });
      
      await tx.partyPayment.update({
        where: { id: payment.id },
        data: { sourceEventId: financialEvent.eventId }
      });
      
      await recalculatePartyLedger(tx, party.id);
      return financialEvent;
    }),
  );
}


export async function deletePartyCollection(id: string) {
  const db = await getDb();
  await runTx(async (tx: any) => {
    const collection = await tx.partyCollection.findUnique({ where: { id } });
    if (!collection) return;
    await tx.partyCollection.delete({ where: { id } });
    
    // Cascade delete events
    await tx.financialEvent.deleteMany({ where: { entityId: id } });
    
    if (collection.partyId) await recalculatePartyLedger(tx, collection.partyId);
  });
}


export async function deletePartyPayment(id: string) {
  const db = await getDb();
  await runTx(async (tx: any) => {
    const payment = await tx.partyPayment.findUnique({ where: { id } });
    if (!payment) return;
    await tx.partyPayment.delete({ where: { id } });
    
    // Cascade delete events
    await tx.financialEvent.deleteMany({ where: { entityId: id } });
    
    if (payment.partyId) await recalculatePartyLedger(tx, payment.partyId);
  });
}


export async function listPartiesWithBalances() {
  const db = await getDb();
  const parties = await db.party.findMany({ orderBy: { partyName: 'asc' } });
  const result = [];
  for (const p of parties) {
    const ledger = await db.partyLedger.findFirst({
      where: { partyId: p.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }]
    });
    result.push({
      id: p.id,
      partyName: p.partyName,
      balance: ledger ? ledger.balance : 0,
    });
  }
  return result.filter(p => p.balance !== 0);
}


export async function listPartyLedgerEntries(partyId: string) {
  const db = await getDb();
  const rows = await db.partyLedger.findMany({
    where: { partyId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return serialize(rows);
}


export async function listOtherCredits(search = "") {
  const db = await getDb();
  const rows = await db.otherCredit.findMany({ orderBy: { createdAt: "desc" } });
  return serialize(rows.filter((row: any) => containsSearch(row, search)));
}


export async function saveOtherCredit(input: any) {
  const db = await getDb();
  const data = {
    name: input.name,
    amount: parseNumber(input.amount, "Amount") ?? 0,
    reason: input.reason,
    expectedDueDate: input.expectedDueDate ? new Date(input.expectedDueDate) : null,
    status: (input.status || "pending").toLowerCase(),
  };
  if (data.amount <= 0) throw new Error("Amount must be greater than 0.");
  if (input.id) {
    return serialize(await runTx(async (tx: any) => {
      const before = await tx.otherCredit.findUnique({ where: { id: input.id } });
      const row = await tx.otherCredit.update({ where: { id: input.id }, data });
      await writeAuditEvent(tx, { entityName: "OtherCredit", entityId: row.id, action: "update", role: "system", before, after: row });
      return row;
    }));
  }
  return serialize(await runTx(async (tx: any) => {
    const row = await tx.otherCredit.create({ data });
    await writeAuditEvent(tx, { entityName: "OtherCredit", entityId: row.id, action: "create", role: "system", after: row });
    return row;
  }));
}


export async function deleteOtherCredit(id: string) {
  const db = await getDb();
  await runTx(async (tx: any) => {
    const before = await tx.otherCredit.findUnique({ where: { id } });
    await tx.otherCredit.delete({ where: { id } });
    if (before) await writeAuditEvent(tx, { entityName: "OtherCredit", entityId: id, action: "delete", role: "system", before });
  });
}



