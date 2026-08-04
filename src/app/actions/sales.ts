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
  if (value instanceof Date) return value.toISOString() as T;
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
    return await runTx(txFn);
  } finally {
    triggerAutoSync().catch(console.error);
  }
}


export async function listSales() {
  const db = await getDb();
  const rows = await db.outgoingSale.findMany({ orderBy: [{ createdAt: "desc" }] });
  return serialize(rows);
}


export async function getLastBookPage(): Promise<{ bookNumber: number; pageNumber: number }> {
  const db = await getDb();
  
  const lastSale = await db.outgoingSale.findFirst({
    where: { bookNumber: { not: null }, pageNumber: { not: null } },
    orderBy: [{ bookNumber: "desc" }, { pageNumber: "desc" }],
    select: { bookNumber: true, pageNumber: true },
  });

  const lastBoulder = await db.incomingBoulder.findFirst({
    where: { bookNumber: { not: null }, pageNumber: { not: null } },
    orderBy: [{ bookNumber: "desc" }, { pageNumber: "desc" }],
    select: { bookNumber: true, pageNumber: true },
  });

  const compare = (a: any, b: any) => {
    if (!a) return b;
    if (!b) return a;
    if (a.bookNumber > b.bookNumber) return a;
    if (a.bookNumber < b.bookNumber) return b;
    return a.pageNumber > b.pageNumber ? a : b;
  };

  const latest = compare(lastSale, lastBoulder);

  if (!latest || latest.bookNumber === null || latest.pageNumber === null) {
    return { bookNumber: 1, pageNumber: 0 };
  }
  return { bookNumber: latest.bookNumber, pageNumber: latest.pageNumber };
}


export async function saveSale(input: SaleInput) {
  const db = await getDb();
  const material = await db.material.findUnique({ where: { id: input.materialId } });
  if (!material) throw new Error("Material is required.");
  const normalizedVehicleNumber = normalizeVehicleNumber(input.vehicleNumber);
  
  let partyId = null;
  if (input.partyName) {
    const party = await upsertPartyByName(input.partyName);
    partyId = party?.id || null;
  }
  
  const parsedQty = parseNumber(input.qty, "Qty", false);
  const vehicle = await upsertVehicleByNumber(normalizedVehicleNumber, input.partyName, partyId, parsedQty);
  if (vehicle && !partyId) partyId = vehicle.partyId;

  return serialize(
    await runTx(async (tx) => {
      const existing = input.id ? await tx.outgoingSale.findUnique({ where: { id: input.id } }) : null;
      const engine = deriveSalesEngine(
        { ...input, partyId } as unknown as SalesDraft,
        { vehicle, material },
      );

      if (existing) {
        if (existing.vehicleId) {
          await decrementVehicleTrips(tx, existing.vehicleId, existing.tripDelta ?? 1);
        }
        const sale = await tx.outgoingSale.update({
          where: { id: input.id },
          data: {
            saleDate: engine.saleDate,
            vehicleId: vehicle?.id ?? null,
            partyId: engine.partyId,
            vehicleNumber: engine.vehicleNumber,
            partyName: engine.partyName,
            materialId: engine.materialId,
            materialName: engine.materialName,
            ratePerCft: engine.ratePerCft,
            qty: engine.qty,
            originalQty: engine.originalQty,
            quantityReason: engine.quantityReason,
            discountType: engine.discountType,
            discountValue: engine.discountValue,
            amount: engine.amount,
            gstEnabled: engine.gstEnabled,
            gstRate: engine.gstRate,
            sgst: engine.sgst,
            cgst: engine.cgst,
            gstAmount: engine.gstAmount,
            finalAmount: engine.finalAmount,
            cashPaid: engine.cashPaid,
            bankPaid: engine.bankPaid,
            gPayPaid: engine.gPayPaid,
            paidTotal: engine.paidTotal,
            remainingCredit: calculateRemainingCredit(engine.finalAmount, engine.paidTotal),
            tripDelta: engine.tripDelta,
            remarks: engine.remarks,
          },
        });
        if (vehicle?.id) {
          await incrementVehicleTrips(tx, vehicle.id, engine.tripDelta);
        }
        if (sale.partyId) await recalculatePartyLedger(tx, sale.partyId);
        if (existing.partyId && existing.partyId !== sale.partyId) await recalculatePartyLedger(tx, existing.partyId);
        await writeAuditEvent(tx, {
          entityName: "Sale",
          entityId: sale.id,
          action: "update",
          role: "system",
          before: existing,
          after: sale,
          reason: engine.qtyChanged ? engine.quantityReason : null,
        });

        // Sync inventory
        if (existing.materialName !== sale.materialName) {
           // Restore old material
           await txAdjustInventoryStock(tx, existing.materialName, existing.qty, 'SALE_OUT', sale.id, `Sale Updated (Material Changed): ${sale.vehicleNumber}`);
           // Deduct new material
           await txAdjustInventoryStock(tx, sale.materialName, -sale.qty, 'SALE_OUT', sale.id, `Sale Updated (New Material): ${sale.vehicleNumber}`);
        } else {
           const qtyDiff = existing.qty - sale.qty; // if old was 10, new is 12, diff is -2
           if (qtyDiff !== 0) {
             await txAdjustInventoryStock(tx, sale.materialName, qtyDiff, 'SALE_OUT', sale.id, `Sale Updated: ${sale.vehicleNumber}`);
           }
        }

        return sale;
      }

      const bookNum = parseNumber(input.bookNumber, "Book", false);
      const pageNum = parseNumber(input.pageNumber, "Page", false);
      const sale = await tx.outgoingSale.create({
        data: {
          saleDate: engine.saleDate,
          bookNumber: bookNum ? Math.round(bookNum) : null,
          pageNumber: pageNum ? Math.round(pageNum) : null,
          vehicleId: vehicle?.id ?? null,
          partyId: engine.partyId,
          materialId: engine.materialId,
          vehicleNumber: engine.vehicleNumber,
          partyName: engine.partyName,
          materialName: engine.materialName,
          ratePerCft: engine.ratePerCft,
          qty: engine.qty,
          originalQty: engine.originalQty,
          quantityReason: engine.quantityReason,
          tripDelta: engine.tripDelta,
          discountType: engine.discountType,
          discountValue: engine.discountValue,
          amount: engine.amount,
          gstEnabled: engine.gstEnabled,
          gstRate: engine.gstRate,
          sgst: engine.sgst,
          cgst: engine.cgst,
          gstAmount: engine.gstAmount,
          finalAmount: engine.finalAmount,
          cashPaid: engine.cashPaid,
          bankPaid: engine.bankPaid,
          gPayPaid: engine.gPayPaid,
          paidTotal: engine.paidTotal,
          remainingCredit: calculateRemainingCredit(engine.finalAmount, engine.paidTotal),
          remarks: engine.remarks,
        },
      });
      await emitFinancialEvent(tx, {
        correlationId: sale.id,
        eventType: "SALE_CREATED",
        entityType: "Sale",
        entityId: sale.id,
        payload: {
          saleId: sale.id,
          bookNumber: sale.bookNumber,
          pageNumber: sale.pageNumber,
          saleDate: sale.saleDate.toISOString(),
          vehicleId: sale.vehicleId,
          partyId: sale.partyId,
          materialId: sale.materialId,
          vehicleNumber: sale.vehicleNumber,
          partyName: sale.partyName,
          materialName: sale.materialName,
          qty: sale.qty,
          originalQty: sale.originalQty ?? sale.qty,
          quantityReason: sale.quantityReason,
          ratePerCft: sale.ratePerCft,
          amount: sale.amount,
          discountType: sale.discountType as "percentage" | "fixed",
          discountValue: sale.discountValue,
          finalAmount: sale.finalAmount,
          cashPaid: sale.cashPaid,
          bankPaid: sale.bankPaid,
          gPayPaid: sale.gPayPaid,
          paidTotal: sale.paidTotal,
          remainingCredit: calculateRemainingCredit(sale.finalAmount, sale.paidTotal),
          tripDelta: sale.tripDelta,
          remarks: sale.remarks,
        },
      });
      if (vehicle?.id) {
        await incrementVehicleTrips(tx, vehicle.id, engine.tripDelta);
      }
      if (sale.partyId) await recalculatePartyLedger(tx, sale.partyId);
      await writeAuditEvent(tx, {
        entityName: "Sale",
        entityId: sale.id,
        action: "create",
        role: "system",
        after: sale,
        reason: engine.qtyChanged ? engine.quantityReason : null,
      });

      // Deduct inventory
      await txAdjustInventoryStock(tx, sale.materialName, -sale.qty, 'SALE_OUT', sale.id, `Sale: ${sale.vehicleNumber}`);

      return sale;
    }),
  );
}


export async function deleteSale(id: string, pin?: string) {
  if (!pin || !(await verifyEditPassword(pin, "delete"))) {
    throw new Error("Invalid delete PIN");
  }
  const db = await getDb();
  await runTx(async (tx) => {
    const existing = await tx.outgoingSale.findUnique({ where: { id } });
    if (existing) {
      await tx.outgoingSale.delete({ where: { id } });
      if (existing.vehicleId) {
        await decrementVehicleTrips(tx, existing.vehicleId, existing.tripDelta ?? 1);
      }
      await writeAuditEvent(tx, {
        entityName: "Sale",
        entityId: id,
        action: "delete",
        role: "system",
        before: existing,
      });
      if (existing.partyId) await recalculatePartyLedger(tx, existing.partyId);

      // Restore inventory
      await txAdjustInventoryStock(tx, existing.materialName, existing.qty, 'SALE_OUT', id, `Sale Deleted: ${existing.vehicleNumber}`);
      
      // Cascade delete financial events and ledger entries
      const events = await tx.financialEvent.findMany({ where: { entityId: id } });
      const eventIds = events.map((e: any) => e.eventId);
      if (eventIds.length > 0) {
        await tx.ledgerEntry.deleteMany({ where: { financialEventId: { in: eventIds } } });
        await tx.financialEvent.deleteMany({ where: { eventId: { in: eventIds } } });
      }

      // Recalculate daybook for the sale date
      const dayBook = await getOrCreateDayBook(tx, existing.saleDate.toISOString());
      await recalculateDayBook(tx, dayBook);
    }
  });
}


export async function purgeNonGstSales(pin?: string): Promise<number> {
  if (!pin || !(await verifyEditPassword(pin, "delete"))) {
    throw new Error("Invalid delete PIN");
  }
  const db = await getDb();
  return await runTx(async (tx) => {
    const nonGstSales = await tx.outgoingSale.findMany({
      where: { gstEnabled: false },
    });
    if (nonGstSales.length === 0) return 0;

    const affectedPartyIds = new Set<string>();
    const affectedDates = new Set<string>();
    for (const sale of nonGstSales) {
      if (sale.vehicleId) {
        await decrementVehicleTrips(tx, sale.vehicleId, sale.tripDelta ?? 1);
      }
      if (sale.partyId) affectedPartyIds.add(sale.partyId);
      affectedDates.add(sale.saleDate.toISOString());
    }

    const saleIds = nonGstSales.map((s: any) => s.id);
    const events = await tx.financialEvent.findMany({ where: { entityId: { in: saleIds } } });
    const eventIds = events.map((e: any) => e.eventId);
    if (eventIds.length > 0) {
      await tx.ledgerEntry.deleteMany({ where: { financialEventId: { in: eventIds } } });
      await tx.financialEvent.deleteMany({ where: { eventId: { in: eventIds } } });
    }

    const deleteResult = await tx.outgoingSale.deleteMany({
      where: { gstEnabled: false },
    });

    for (const partyId of Array.from(affectedPartyIds)) {
      await recalculatePartyLedger(tx, partyId);
    }
    
    for (const d of Array.from(affectedDates)) {
      const dayBook = await getOrCreateDayBook(tx, d);
      await recalculateDayBook(tx, dayBook);
    }

    await writeAuditEvent(tx, {
      entityName: "Sale",
      entityId: "BULK_PURGE",
      action: "delete",
      role: "system",
      before: { count: nonGstSales.length, ids: nonGstSales.map((s: any) => s.id) },
    });

    return deleteResult.count;
  });
}


