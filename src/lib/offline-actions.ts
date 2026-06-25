"use server";

import { getDb } from "@/lib/prisma";

type DiscountType = "percentage" | "fixed";

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

type SaleInput = {
  id?: string;
  saleDate?: string;
  vehicleNumber: string;
  partyName: string;
  materialId: string;
  ratePerCft?: string | number | null;
  qty: string | number;
  discountType: DiscountType;
  discountValue: string | number;
  cashPaid?: string | number | null;
  bankPaid?: string | number | null;
  remarks?: string | null;
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
    return serialize(await db.vehicle.update({ where: { id: input.id }, data }));
  }
  return serialize(await db.vehicle.create({ data }));
}

export async function deleteVehicle(id: string) {
  const db = await getDb();
  await db.vehicle.delete({ where: { id } });
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
    return serialize(await db.party.update({ where: { id: input.id }, data }));
  }
  return serialize(await db.party.create({ data }));
}

export async function deleteParty(id: string) {
  const db = await getDb();
  await db.party.delete({ where: { id } });
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
  return serialize(await db.material.update({ where: { id }, data: { ratePerCft: rate } }));
}

export async function listSales() {
  const db = await getDb();
  const rows = await db.outgoingSale.findMany({ orderBy: [{ serialNumber: "desc" }] });
  return serialize(rows);
}

export async function saveSale(input: SaleInput) {
  const db = await getDb();
  const vehicleNumber = normalizeVehicleNumber(requiredText(input.vehicleNumber, "Vehicle number"));
  const partyName = requiredText(input.partyName, "Party name");
  const qty = parseNumber(input.qty, "Qty") ?? 0;
  const discountValue = parseNumber(input.discountValue, "Discount", false) ?? 0;
  const cashPaid = parseNumber(input.cashPaid, "Cash Paid", false) ?? 0;
  const bankPaid = parseNumber(input.bankPaid, "Bank/GPay Paid", false) ?? 0;
  if (qty <= 0) throw new Error("Qty must be greater than 0.");
  if (discountValue < 0) throw new Error("Discount cannot be negative.");
  if (cashPaid < 0) throw new Error("Cash Paid cannot be negative.");
  if (bankPaid < 0) throw new Error("Bank/GPay Paid cannot be negative.");
  if (!["percentage", "fixed"].includes(input.discountType)) throw new Error("Discount type is invalid.");

  const material = await db.material.findUnique({ where: { id: input.materialId } });
  if (!material) throw new Error("Material is required.");

  await upsertPartyByName(partyName);

  return serialize(
    await db.$transaction(async (tx) => {
      const existing = input.id ? await tx.outgoingSale.findUnique({ where: { id: input.id } }) : null;

      // Use user-supplied rate if provided, otherwise fall back to material default
      const formRate =
        input.ratePerCft !== undefined && input.ratePerCft !== null && input.ratePerCft !== ""
          ? (parseNumber(input.ratePerCft, "Rate") ?? material.ratePerCft)
          : material.ratePerCft;
      const ratePerCft = formRate;

      const amount = roundMoney(qty * ratePerCft);
      const discountAmount =
        input.discountType === "percentage" ? roundMoney((amount * discountValue) / 100) : roundMoney(discountValue);
      if (discountAmount > amount) throw new Error("Discount cannot be greater than amount.");
      const finalAmount = roundMoney(amount - discountAmount);
      const saleDate = parseDateInput(input.saleDate);

      if (existing) {
        const sale = await tx.outgoingSale.update({
          where: { id: input.id },
          data: {
            saleDate,
            vehicleNumber,
            partyName,
            materialName: material.materialName,
            ratePerCft,
            qty,
            discountType: input.discountType,
            discountValue,
            amount,
            finalAmount,
            cashPaid,
            bankPaid,
            remarks: cleanText(input.remarks),
          },
        });
        await tx.partyCredit.deleteMany({ where: { saleId: sale.id } });
        await tx.partyCredit.create({
          data: { partyName, saleId: sale.id, amount: finalAmount, status: "pending" },
        });
        return sale;
      }

      const max = await tx.outgoingSale.aggregate({ _max: { serialNumber: true } });
      const serialNumber = (max._max.serialNumber ?? 0) + 1;
      const sale = await tx.outgoingSale.create({
        data: {
          saleDate,
          serialNumber,
          vehicleNumber,
          partyName,
          materialName: material.materialName,
          ratePerCft,
          qty,
          discountType: input.discountType,
          discountValue,
          amount,
          finalAmount,
          cashPaid,
          bankPaid,
          remarks: cleanText(input.remarks),
        },
      });
      await tx.partyCredit.create({
        data: { partyName, saleId: sale.id, amount: finalAmount, status: "pending" },
      });
      return sale;
    }),
  );
}

export async function deleteSale(id: string) {
  const db = await getDb();
  await db.$transaction(async (tx) => {
    await tx.partyCredit.deleteMany({ where: { saleId: id } });
    await tx.outgoingSale.delete({ where: { id } });
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
    return serialize(await db.incomingBoulder.update({ where: { id: input.id }, data }));
  }
  return serialize(await db.incomingBoulder.create({ data }));
}

export async function deleteIncomingBoulder(id: string) {
  const db = await getDb();
  await db.incomingBoulder.delete({ where: { id } });
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
    return serialize(await db.employeeCredit.update({ where: { id: input.id }, data }));
  }
  return serialize(await db.employeeCredit.create({ data }));
}

export async function deleteEmployeeCredit(id: string) {
  const db = await getDb();
  await db.employeeCredit.delete({ where: { id } });
}

export async function getTodayForInput() {
  return dateOnly(new Date());
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
