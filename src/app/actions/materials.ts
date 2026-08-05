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


export async function listMaterials(search = "") {
  const db = await getDb();
  const rows = await db.material.findMany({ orderBy: { materialName: "asc" } });
  return serialize(rows.filter((row) => containsSearch(row, search)));
}


export async function updateMaterialRate(id: string, ratePerCft: string | number) {
  const db = await getDb();
  const rate = parseNumber(ratePerCft, "Rate");
  if (rate === null || rate < 0) throw new Error("Rate must be zero or greater.");
  return serialize(await runTx(async (tx) => {
    const before = await tx.material.findUnique({ where: { id } });
    const row = await tx.material.update({ where: { id }, data: { ratePerCft: rate } });
    await writeAuditEvent(tx, { entityName: "Material", entityId: row.id, action: "update", role: "system", before, after: row });
    return row;
  }));
}


