"use server";

import { getDb } from "@/lib/prisma";
import { deriveSalesEngine, type SalesDraft } from "@/lib/sales-engine";
import { calculateRemainingCredit, decrementVehicleTrips, incrementVehicleTrips, writeAuditEvent } from "@/lib/domain";
import { emitFinancialEvent } from "@/lib/domain/financial-events";

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
  date?: string;
  vehicleNumber: string;
  partyName: string;
  qty: string | number;
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
    await db.party.create({ data: { partyName: name } });
  }
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
  const rows = await db.outgoingSale.findMany({ orderBy: [{ serialNumber: "desc" }] });
  return serialize(rows);
}

export async function saveSale(input: SaleInput) {
  const db = await getDb();
  const material = await db.material.findUnique({ where: { id: input.materialId } });
  if (!material) throw new Error("Material is required.");
  const normalizedVehicleNumber = normalizeVehicleNumber(input.vehicleNumber);
  const vehicle = await db.vehicle.findFirst({
    where: input.vehicleId
      ? { id: input.vehicleId }
      : { vehicleNumber: normalizedVehicleNumber },
  });
  if (input.vehicleNumber && !vehicle) {
    await upsertPartyByName(input.partyName);
  }

  return serialize(
    await db.$transaction(async (tx) => {
      const existing = input.id ? await tx.outgoingSale.findUnique({ where: { id: input.id } }) : null;
      const engine = deriveSalesEngine(
        input as unknown as SalesDraft,
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
            partyId: vehicle?.partyId ?? null,
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
        await tx.partyCredit.deleteMany({ where: { saleId: sale.id } });
        await tx.partyCredit.create({
          data: { partyName: engine.partyName, saleId: sale.id, amount: calculateRemainingCredit(engine.finalAmount, engine.paidTotal), status: "pending" },
        });
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

      const max = await tx.outgoingSale.aggregate({ _max: { serialNumber: true } });
      const serialNumber = (max._max.serialNumber ?? 0) + 1;
      const sale = await tx.outgoingSale.create({
        data: {
          saleDate: engine.saleDate,
          serialNumber,
          vehicleId: vehicle?.id ?? null,
          partyId: vehicle?.partyId ?? null,
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
          serialNumber: sale.serialNumber,
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
      await tx.partyCredit.create({
        data: { partyName: engine.partyName, saleId: sale.id, amount: calculateRemainingCredit(engine.finalAmount, engine.paidTotal), status: "pending" },
      });
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
    await tx.partyCredit.deleteMany({ where: { saleId: id } });
    await tx.outgoingSale.delete({ where: { id } });
    if (existing?.vehicleId) {
      await decrementVehicleTrips(tx, existing.vehicleId, existing.tripDelta ?? 1);
    }
    if (existing) {
      await writeAuditEvent(tx, {
        entityName: "Sale",
        entityId: id,
        action: "delete",
        role: "system",
        before: existing,
      });
    }
  });
}

export async function listIncomingBoulder(search = "") {
  const db = await getDb();
  const rows = await db.incomingBoulder.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
  return serialize(rows.filter((row) => containsSearch(row, search)));
}

export async function saveIncomingBoulder(input: IncomingBoulderInput) {
  const db = await getDb();
  const data = {
    date: parseDateInput(input.date),
    vehicleNumber: normalizeVehicleNumber(requiredText(input.vehicleNumber, "Vehicle number")),
    partyName: requiredText(input.partyName, "Party name"),
    materialName: "ROCK",
    qty: parseNumber(input.qty, "Qty") ?? 0,
    remarks: cleanText(input.remarks),
  };
  if (data.qty <= 0) throw new Error("Qty must be greater than 0.");
  await upsertPartyByName(data.partyName);
  if (input.id) {
    return serialize(await db.$transaction(async (tx) => {
      const before = await tx.incomingBoulder.findUnique({ where: { id: input.id } });
      const row = await tx.incomingBoulder.update({ where: { id: input.id }, data });
      await writeAuditEvent(tx, { entityName: "IncomingBoulder", entityId: row.id, action: "update", role: "system", before, after: row });
      return row;
    }));
  }
  return serialize(await db.$transaction(async (tx) => {
    const row = await tx.incomingBoulder.create({ data });
    await writeAuditEvent(tx, { entityName: "IncomingBoulder", entityId: row.id, action: "create", role: "system", after: row });
    return row;
  }));
}

export async function deleteIncomingBoulder(id: string) {
  const db = await getDb();
  await db.$transaction(async (tx) => {
    const before = await tx.incomingBoulder.findUnique({ where: { id } });
    await tx.incomingBoulder.delete({ where: { id } });
    if (before) await writeAuditEvent(tx, { entityName: "IncomingBoulder", entityId: id, action: "delete", role: "system", before });
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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
