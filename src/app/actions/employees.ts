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
    return serialize(await runTx(async (tx) => {
      const before = await tx.employeeCredit.findUnique({ where: { id: input.id } });
      const row = await tx.employeeCredit.update({ where: { id: input.id }, data });
      await writeAuditEvent(tx, { entityName: "EmployeeCredit", entityId: row.id, action: "update", role: "system", before, after: row });
      return row;
    }));
  }
  return serialize(await runTx(async (tx) => {
    const row = await tx.employeeCredit.create({ data });
    await writeAuditEvent(tx, { entityName: "EmployeeCredit", entityId: row.id, action: "create", role: "system", after: row });
    return row;
  }));
}


export async function deleteEmployeeCredit(id: string) {
  const db = await getDb();
  await runTx(async (tx) => {
    const before = await tx.employeeCredit.findUnique({ where: { id } });
    await tx.employeeCredit.delete({ where: { id } });
    if (before) await writeAuditEvent(tx, { entityName: "EmployeeCredit", entityId: id, action: "delete", role: "system", before });
  });
}


export async function listEmployees() {
  const db = await getDb();
  const rows = await db.employee.findMany({
    orderBy: { name: "asc" }
  });
  return serialize(rows);
}


export async function saveEmployee(input: any) {
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
  
  return serialize(await runTx(async (tx) => {
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


