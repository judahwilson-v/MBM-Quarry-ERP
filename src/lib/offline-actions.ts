"use server";

import { getDb } from "@/lib/prisma";
import { deriveSalesEngine, type SalesDraft } from "@/lib/sales-engine";
import { calculateRemainingCredit, decrementVehicleTrips, incrementVehicleTrips, writeAuditEvent } from "@/lib/domain";
import { emitFinancialEvent } from "@/lib/domain/financial-events";
import { addDayBookExpense, rebuildDayBook, setDayBookOpeningBalances, projectDayBookExpense, recalculateDayBook } from "@/lib/domain/daybook";
import { recalculatePartyLedger } from "@/lib/domain/ledger/party-ledger-service";

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

export async function listVehicles(search = "") {
  const db = await getDb();
  const rows = await db.vehicle.findMany({ orderBy: { vehicleNumber: "asc" } });
  return serialize(rows.filter((row) => containsSearch(row, search)));
}

export async function saveVehicle(input: VehicleInput) {
  const db = await getDb();
  const vehicleNumber = normalizeVehicleNumber(requiredText(input.vehicleNumber, "Vehicle number"));
  const partyName = cleanText(input.partyName);
  const companyBodyQty = parseNumber(input.companyBodyQty, "Company body qty", false);
  const extraBodyQty = parseNumber(input.extraBodyQty, "Extra body qty", false);

  if (partyName) await upsertPartyByName(partyName);

  const data = { vehicleNumber, partyName, companyBodyQty, extraBodyQty };
  if (input.id) {
    return serialize(await db.$transaction(async (tx) => {
      const before = await tx.vehicle.findUnique({ where: { id: input.id } });
      const row = await tx.vehicle.update({ where: { id: input.id }, data });
      await writeAuditEvent(tx, { entityName: "Vehicle", entityId: row.id, action: "update", role: "system", before, after: row });
      return row;
    }));
  }
  return serialize(await db.$transaction(async (tx) => {
    const row = await tx.vehicle.create({ data });
    await writeAuditEvent(tx, { entityName: "Vehicle", entityId: row.id, action: "create", role: "system", after: row });
    return row;
  }));
}

export async function deleteVehicle(id: string) {
  const db = await getDb();
  await db.$transaction(async (tx) => {
    const before = await tx.vehicle.findUnique({ where: { id } });
    await tx.vehicle.delete({ where: { id } });
    if (before) await writeAuditEvent(tx, { entityName: "Vehicle", entityId: id, action: "delete", role: "system", before });
  });
}

export async function listParties(search = "") {
  const db = await getDb();
  const rows = await db.party.findMany({ orderBy: { partyName: "asc" } });
  return serialize(rows.filter((row) => containsSearch(row, search)));
}

export async function saveParty(input: PartyInput) {
  const db = await getDb();
  const data = {
    partyName: requiredText(input.partyName, "Party name"),
    phone: cleanText(input.phone),
    address: cleanText(input.address),
  };
  if (input.id) {
    return serialize(await db.$transaction(async (tx) => {
      const before = await tx.party.findUnique({ where: { id: input.id } });
      const row = await tx.party.update({ where: { id: input.id }, data });
      await writeAuditEvent(tx, { entityName: "Party", entityId: row.id, action: "update", role: "system", before, after: row });
      return row;
    }));
  }
  return serialize(await db.$transaction(async (tx) => {
    const row = await tx.party.create({ data });
    await writeAuditEvent(tx, { entityName: "Party", entityId: row.id, action: "create", role: "system", after: row });
    return row;
  }));
}

export async function deleteParty(id: string) {
  const db = await getDb();
  await db.$transaction(async (tx) => {
    const before = await tx.party.findUnique({ where: { id } });
    await tx.party.delete({ where: { id } });
    if (before) await writeAuditEvent(tx, { entityName: "Party", entityId: id, action: "delete", role: "system", before });
  });
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
  return serialize(await db.$transaction(async (tx) => {
    const before = await tx.material.findUnique({ where: { id } });
    const row = await tx.material.update({ where: { id }, data: { ratePerCft: rate } });
    await writeAuditEvent(tx, { entityName: "Material", entityId: row.id, action: "update", role: "system", before, after: row });
    return row;
  }));
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
    await db.$transaction(async (tx) => {
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
      return sale;
    }),
  );
}

export async function deleteSale(id: string) {
  const db = await getDb();
  await db.$transaction(async (tx) => {
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
    }
  });
}

export async function purgeNonGstSales(): Promise<number> {
  const db = await getDb();
  return await db.$transaction(async (tx) => {
    const nonGstSales = await tx.outgoingSale.findMany({
      where: { gstEnabled: false },
    });
    if (nonGstSales.length === 0) return 0;

    const affectedPartyIds = new Set<string>();
    for (const sale of nonGstSales) {
      if (sale.vehicleId) {
        await decrementVehicleTrips(tx, sale.vehicleId, sale.tripDelta ?? 1);
      }
      if (sale.partyId) affectedPartyIds.add(sale.partyId);
    }

    const deleteResult = await tx.outgoingSale.deleteMany({
      where: { gstEnabled: false },
    });

    for (const partyId of Array.from(affectedPartyIds)) {
      await recalculatePartyLedger(tx, partyId);
    }

    await writeAuditEvent(tx, {
      entityName: "Sale",
      entityId: "BULK_PURGE",
      action: "delete",
      role: "system",
      before: { count: nonGstSales.length, ids: nonGstSales.map(s => s.id) },
    });

    return deleteResult.count;
  });
}

export async function listIncomingBoulder(search = "") {
  const db = await getDb();
  const rows = await db.incomingBoulder.findMany({ orderBy: [{ createdAt: "desc" }] });
  return serialize(rows.filter((row) => containsSearch(row, search)));
}

export async function saveIncomingBoulder(input: IncomingBoulderInput) {
  const db = await getDb();
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
  const normalizedVehicle = normalizeVehicleNumber(requiredText(input.vehicleNumber, "Vehicle number"));
  const partyName = requiredText(input.partyName, "Party name");
  
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
    return serialize(await db.$transaction(async (tx) => {
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

      return row;
    }));
  }
  return serialize(await db.$transaction(async (tx) => {
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

    return row;
  }));
}

export async function deleteIncomingBoulder(id: string) {
  const db = await getDb();
  await db.$transaction(async (tx) => {
    const before = await tx.incomingBoulder.findUnique({ where: { id } });
    await tx.incomingBoulder.delete({ where: { id } });
    if (before) {
      await writeAuditEvent(tx, { entityName: "IncomingBoulder", entityId: id, action: "delete", role: "system", before });
      if (before.partyId) await recalculatePartyLedger(tx, before.partyId);
    }
  });
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

export async function listEmployeeCredits(search = "") {
  const db = await getDb();
  const rows = await db.employeeCredit.findMany({ orderBy: { createdAt: "desc" } });
  return serialize(rows.filter((row) => containsSearch(row, search)));
}

export async function saveEmployeeCredit(input: EmployeeCreditInput) {
  const db = await getDb();
  const data = {
    employeeName: requiredText(input.employeeName, "Employee name"),
    amount: parseNumber(input.amount, "Amount") ?? 0,
    reason: cleanText(input.reason),
    expectedDueDate: input.expectedDueDate ? parseDateInput(input.expectedDueDate) : null,
    status: requiredText(input.status || "pending", "Status").toLowerCase(),
  };
  if (data.amount <= 0) throw new Error("Amount must be greater than 0.");
  if (input.id) {
    return serialize(await db.$transaction(async (tx) => {
      const before = await tx.employeeCredit.findUnique({ where: { id: input.id } });
      const row = await tx.employeeCredit.update({ where: { id: input.id }, data });
      await writeAuditEvent(tx, { entityName: "EmployeeCredit", entityId: row.id, action: "update", role: "system", before, after: row });
      return row;
    }));
  }
  return serialize(await db.$transaction(async (tx) => {
    const row = await tx.employeeCredit.create({ data });
    await writeAuditEvent(tx, { entityName: "EmployeeCredit", entityId: row.id, action: "create", role: "system", after: row });
    return row;
  }));
}

export async function deleteEmployeeCredit(id: string) {
  const db = await getDb();
  await db.$transaction(async (tx) => {
    const before = await tx.employeeCredit.findUnique({ where: { id } });
    await tx.employeeCredit.delete({ where: { id } });
    if (before) await writeAuditEvent(tx, { entityName: "EmployeeCredit", entityId: id, action: "delete", role: "system", before });
  });
}

export async function getTodayForInput() {
  return dateOnly(new Date());
}




export async function saveDayBookOpeningBalances(input: any) {
  const db = await getDb();
  const openingCashBalance = parseNumber(input.openingCashBalance, "Opening cash balance") ?? 0;
  const openingBankBalance = parseNumber(input.openingBankBalance, "Opening bank balance") ?? 0;
  return serialize(
    await db.$transaction(async (tx: any) => setDayBookOpeningBalances(tx, {
      businessDate: input.businessDate,
      openingCashBalance,
      openingBankBalance,
    })),
  );
}

export async function saveDayBookExpense(input: any) {
  const db = await getDb();
  const amount = parseNumber(input.amount, "Expense amount") ?? 0;
  if (amount <= 0) throw new Error("Expense amount must be greater than 0.");
  return serialize(
    await db.$transaction(async (tx: any) => addDayBookExpense(tx, {
      businessDate: input.businessDate,
      expenseType: input.expenseType,
      amount,
      description: input.description,
    })),
  );
}

export async function rebuildBusinessDayBook(businessDate?: string) {
  const db = await getDb();
  return serialize(await db.$transaction(async (tx: any) => rebuildDayBook(tx, businessDate)));
}

function normalizePartyName(value: string) {
  return value.trim().replace(/\s+/g, " ");
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
  const partyName = normalizePartyName(input.partyName || "");
  const cashPaid = parseNumber(input.cashPaid ?? 0, "Cash paid", false) ?? 0;
  const bankPaid = parseNumber(input.bankPaid ?? 0, "Bank paid", false) ?? 0;
  const gPayPaid = parseNumber(input.gPayPaid ?? 0, "GPay paid", false) ?? 0;
  const totalAmount = roundMoney(cashPaid + bankPaid + gPayPaid);
  if (totalAmount <= 0) throw new Error("Collection amount must be greater than 0.");
  const collectionDate = input.collectionDate ? new Date(input.collectionDate) : new Date();

  return serialize(
    await db.$transaction(async (tx: any) => {
      const party = await tx.party.findFirst({ where: { partyName: { equals: partyName } } });
      if (!party) throw new Error("Party not found.");
      
      const financialEvent = await emitFinancialEvent(tx, {
        correlationId: party.id,
        eventType: "PARTY_COLLECTION_CREATED",
        entityType: "PartyCollection",
        entityId: party.id,
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
  const partyName = normalizePartyName(input.partyName || "");
  const cashPaid = parseNumber(input.cashPaid ?? 0, "Cash paid", false) ?? 0;
  const bankPaid = parseNumber(input.bankPaid ?? 0, "Bank paid", false) ?? 0;
  const gPayPaid = parseNumber(input.gPayPaid ?? 0, "GPay paid", false) ?? 0;
  const totalAmount = roundMoney(cashPaid + bankPaid + gPayPaid);
  if (totalAmount <= 0) throw new Error("Payment amount must be greater than 0.");
  const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();

  return serialize(
    await db.$transaction(async (tx: any) => {
      const party = await tx.party.findFirst({ where: { partyName: { equals: partyName } } });
      if (!party) throw new Error("Party not found.");
      
      const financialEvent = await emitFinancialEvent(tx, {
        correlationId: party.id,
        eventType: "PARTY_PAYMENT_CREATED",
        entityType: "PartyPayment",
        entityId: party.id,
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
      await recalculatePartyLedger(tx, party.id);
      return financialEvent;
    }),
  );
}

export async function deletePartyCollection(id: string) {
  const db = await getDb();
  await db.$transaction(async (tx: any) => {
    const collection = await tx.partyCollection.findUnique({ where: { id } });
    if (!collection) return;
    await tx.partyCollection.delete({ where: { id } });
    await emitFinancialEvent(tx, {
      correlationId: collection.partyId,
      eventType: "PARTY_COLLECTION_DELETED",
      entityType: "PartyCollection",
      entityId: id,
      payload: collection,
    });
    if (collection.partyId) await recalculatePartyLedger(tx, collection.partyId);
  });
}

export async function deletePartyPayment(id: string) {
  const db = await getDb();
  await db.$transaction(async (tx: any) => {
    const payment = await tx.partyPayment.findUnique({ where: { id } });
    if (!payment) return;
    await tx.partyPayment.delete({ where: { id } });
    await emitFinancialEvent(tx, {
      correlationId: payment.partyId,
      eventType: "PARTY_PAYMENT_DELETED",
      entityType: "PartyPayment",
      entityId: id,
      payload: payment,
    });
    if (payment.partyId) await recalculatePartyLedger(tx, payment.partyId);
  });
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
    return serialize(await db.$transaction(async (tx: any) => {
      const before = await tx.otherCredit.findUnique({ where: { id: input.id } });
      const row = await tx.otherCredit.update({ where: { id: input.id }, data });
      await writeAuditEvent(tx, { entityName: "OtherCredit", entityId: row.id, action: "update", role: "system", before, after: row });
      return row;
    }));
  }
  return serialize(await db.$transaction(async (tx: any) => {
    const row = await tx.otherCredit.create({ data });
    await writeAuditEvent(tx, { entityName: "OtherCredit", entityId: row.id, action: "create", role: "system", after: row });
    return row;
  }));
}

export async function deleteOtherCredit(id: string) {
  const db = await getDb();
  await db.$transaction(async (tx: any) => {
    const before = await tx.otherCredit.findUnique({ where: { id } });
    await tx.otherCredit.delete({ where: { id } });
    if (before) await writeAuditEvent(tx, { entityName: "OtherCredit", entityId: id, action: "delete", role: "system", before });
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

export async function listExpenses() {
  const db = await getDb();
  const rows = await db.expense.findMany({
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
  });
  return serialize(rows);
}

export async function saveExpense(input: any) {
  const db = await getDb();
  const amount = parseNumber(input.amount, "Amount") ?? 0;
  if (amount <= 0) throw new Error("Expense amount must be greater than 0.");
  
  return serialize(await db.$transaction(async (tx: any) => {
    let partyId = input.partyId;
    let partyName = input.partyName;
    if (partyName) {
      partyName = normalizePartyName(partyName);
      let party = await tx.party.findFirst({ where: { partyName: { equals: partyName } } });
      if (!party) party = await tx.party.create({ data: { partyName } });
      partyId = party.id;
    }

    let vehicleId = input.vehicleId;
    let vehicleNumber = input.vehicleNumber;
    if (vehicleNumber) {
      vehicleNumber = normalizeVehicleNumber(vehicleNumber);
      let vehicle = await tx.vehicle.findFirst({ where: { vehicleNumber: { equals: vehicleNumber } } });
      if (!vehicle) vehicle = await tx.vehicle.create({ data: { vehicleNumber } });
      vehicleId = vehicle.id;
    }

    const data = {
      expenseDate: input.expenseDate ? new Date(input.expenseDate) : new Date(),
      expenseType: input.expenseType,
      amount,
      paymentMode: input.paymentMode || "CASH",
      partyId: partyId || null,
      partyName: partyName || null,
      vehicleId: vehicleId || null,
      vehicleNumber: vehicleNumber || null,
      description: cleanText(input.description),
    };

    if (input.id) {
      const before = await tx.expense.findUnique({ where: { id: input.id } });
      const row = await tx.expense.update({ where: { id: input.id }, data });
      
      const financialEvent = await tx.financialEvent.findFirst({ where: { entityId: input.id } });
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
    
    
    
    // First get or create daybook (we need to do it manually here or use a helper)
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
}

export async function deleteExpense(id: string) {
  const db = await getDb();
  return serialize(await db.$transaction(async (tx: any) => {
    const row = await tx.expense.findUnique({ where: { id } });
    if (!row) throw new Error("Expense not found");

    const financialEvent = await tx.financialEvent.findFirst({ where: { entityId: id } });
    if (financialEvent) await tx.financialEvent.delete({ where: { id: financialEvent.id } });

    await tx.expense.delete({ where: { id } });
    await writeAuditEvent(tx, { entityName: "Expense", entityId: id, action: "delete", role: "system", before: row, after: null });
    return row;
  }));
}

export async function getDashboardTotals() {
  const db = await getDb();
  
  const parties = await db.party.findMany({
    select: {
      id: true,
      partyLedgers: {
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { balance: true }
      }
    }
  });

  let totalToReceive = 0;
  let totalToPay = 0;

  for (const party of parties) {
    if (party.partyLedgers.length > 0) {
      const balance = party.partyLedgers[0].balance;
      // Balance Positive = MBM is Owed (To Receive)
      // Balance Negative = MBM Owes (To Pay)
      if (balance > 0) {
        totalToReceive += balance;
      } else if (balance < 0) {
        totalToPay += Math.abs(balance);
      }
    }
  }

  return { totalToReceive, totalToPay };
}

export type FuelPurchaseInput = {
  id?: string;
  date: string;
  fuelType: string;
  pricePerLitre?: string | number | null;
  qtyLitre?: string | number | null;
  amount: string | number;
  paidAmount: string | number;
  isCan: boolean;
  vehicleId?: string | null;
  vehicleNumber?: string | null;
};

export async function listFuelPurchases() {
  const db = await getDb();
  const rows = await db.fuelPurchase.findMany({
    orderBy: { date: "desc" },
    include: { vehicle: true }
  });
  return serialize(rows);
}

export async function saveFuelPurchase(input: FuelPurchaseInput) {
  const db = await getDb();
  
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

  return serialize(await db.$transaction(async (tx) => {
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
  const db = await getDb();
  return serialize(await db.$transaction(async (tx: any) => {
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

export async function listEmployees() {
  const db = await getDb();
  const rows = await db.employee.findMany({
    orderBy: { name: "asc" }
  });
  return serialize(rows);
}

export async function saveEmployee(input: EmployeeInput) {
  const db = await getDb();
  const data = {
    name: input.name,
    phone: input.phone || null,
    address: input.address || null,
    role: input.role || "STAFF",
  };
  
  if (input.id) {
    const row = await db.employee.update({ where: { id: input.id }, data });
    return serialize(row);
  } else {
    const row = await db.employee.create({ data });
    return serialize(row);
  }
}

export async function deleteEmployee(id: string) {
  const db = await getDb();
  await db.employee.delete({ where: { id } });
  return true;
}

export type EmployeeLedgerInput = {
  employeeId: string;
  date: string;
  type: string; 
  amount: string | number;
  description?: string | null;
  cashPaid?: string | number | null;
};

export async function saveEmployeeLedgerEntry(input: EmployeeLedgerInput) {
  const db = await getDb();
  const amount = parseNumber(input.amount, "Amount") || 0;
  const cashPaid = parseNumber(input.cashPaid, "Cash Paid", false) || 0;
  const date = parseDateInput(input.date);
  
  return serialize(await db.$transaction(async (tx) => {
    const employee = await tx.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) throw new Error("Employee not found");
    
    let newBalance = employee.balance;
    if (input.type === 'SALARY') newBalance += amount;
    else newBalance -= amount; 
    
    const row = await tx.employeeLedger.create({
      data: {
        employeeId: employee.id,
        date,
        type: input.type,
        amount,
        balance: newBalance,
        description: input.description || null,
      }
    });
    
    await tx.employee.update({
      where: { id: employee.id },
      data: { balance: newBalance }
    });

    if (cashPaid > 0) {
      const eventId = crypto.randomUUID();
      const expense = await tx.expense.create({
        data: {
          expenseDate: date,
          expenseType: `EMPLOYEE_${input.type}`,
          amount: cashPaid,
          description: `Employee ${input.type}: ${employee.name}`,
          sourceEventId: eventId
        }
      });
      const financialEvent = await emitFinancialEvent(tx, {
        correlationId: expense.id,
        eventType: "EXPENSE_CREATED",
        entityType: "Expense",
        entityId: expense.id,
        payload: { ...expense, expenseDate: date.toISOString() }
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

export async function getEmployeeLedger(employeeId: string) {
  const db = await getDb();
  const rows = await db.employeeLedger.findMany({
    where: { employeeId },
    orderBy: [{ date: 'asc' }, { id: 'asc' }]
  });
  return serialize(rows);
}
