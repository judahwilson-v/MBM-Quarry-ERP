import { Prisma, type Role, type SyncStatus } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { paymentSchema, saleSchema } from "@/lib/validation";
import { writeAudit } from "@/lib/audit";
import { endOfDay, formatCurrency, startOfDay } from "@/lib/utils";

type Tx = Prisma.TransactionClient;
type SalePayload = unknown;
type SaleInput = ReturnType<typeof saleSchema.parse>;
type ResolvedSaleInput = SaleInput & { partyId: string; vehicleId?: string | null };

const Decimal = Prisma.Decimal;
const registerMaterials = ["6mm", "20mm", "40mm", "M-Sand", "P-Sand", "Dust"] as const;

function decimal(value: unknown) {
  return new Decimal(String(value ?? 0));
}

function money(value: Prisma.Decimal) {
  return value.toDecimalPlaces(2);
}

function toDate(value: unknown, time?: string | null) {
  const date = value ? new Date(value as string | Date) : new Date();
  if (time && /^\d{2}:\d{2}/.test(time)) {
    const [hours, minutes] = time.split(":").map(Number);
    date.setHours(hours, minutes, 0, 0);
  }
  return date;
}

function dayToken(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function canAllowNegative(role: Role, requested?: boolean) {
  return requested && (role === "OWNER" || role === "MANAGER");
}

function paymentMismatch(total: Prisma.Decimal, netAmount: Prisma.Decimal) {
  return `Payment total ${formatCurrency(total)} does not match Net Amount ${formatCurrency(netAmount)}.`;
}

function cleanName(value?: string | null) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function normalizeVehicleNumber(value?: string | null) {
  return cleanName(value).toUpperCase();
}

function materialRegisterLabel(material?: { code?: string | null; name?: string | null } | null) {
  const raw = `${material?.code ?? ""} ${material?.name ?? ""}`.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.includes("6MM")) return "6mm";
  if (raw.includes("20MM")) return "20mm";
  if (raw.includes("40MM")) return "40mm";
  if (raw.includes("MSAND")) return "M-Sand";
  if (raw.includes("PSAND")) return "P-Sand";
  if (raw.includes("DUST")) return "Dust";
  return material?.name ?? material?.code ?? "Other";
}

function emptyMaterialTotals() {
  return Object.fromEntries(registerMaterials.map((material) => [material, 0])) as Record<string, number>;
}

function buildPersistedSaleSummary(rows: Array<{ material?: { code?: string | null; name?: string | null } | null; qty: Prisma.Decimal; cashAmount: Prisma.Decimal; bankAmount: Prisma.Decimal; gpayAmount: Prisma.Decimal; creditAmount: Prisma.Decimal; netAmount: Prisma.Decimal }>) {
  const materialTotals = emptyMaterialTotals();
  let cashSales = new Decimal(0);
  let creditSales = new Decimal(0);
  let totalSales = new Decimal(0);

  for (const row of rows) {
    const label = materialRegisterLabel(row.material);
    materialTotals[label] = (materialTotals[label] ?? 0) + Number(row.qty ?? 0);
    cashSales = cashSales.plus(row.cashAmount ?? 0).plus(row.bankAmount ?? 0).plus(row.gpayAmount ?? 0);
    creditSales = creditSales.plus(row.creditAmount ?? 0);
    totalSales = totalSales.plus(row.netAmount ?? 0);
  }

  return {
    materialTotals,
    cashSales: money(cashSales),
    creditSales: money(creditSales),
    totalSales: money(totalSales),
  };
}

function weekBounds(date: Date) {
  const start = startOfDay(date);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);
  const end = endOfDay(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

async function refreshDailySummary(tx: Tx, date: Date) {
  const day = startOfDay(date);
  const rows = await tx.sale.findMany({
    where: { deletedAt: null, date: { gte: day, lte: endOfDay(date) } },
    include: { material: true },
  });
  const summary = buildPersistedSaleSummary(rows);
  await tx.dailySummary.upsert({
    where: { date: day },
    update: summary,
    create: { date: day, ...summary },
  });
}

async function refreshWeeklySummary(tx: Tx, date: Date) {
  const { start, end } = weekBounds(date);
  const rows = await tx.sale.findMany({
    where: { deletedAt: null, date: { gte: start, lte: end } },
    include: { material: true },
  });
  const summary = buildPersistedSaleSummary(rows);
  await tx.weeklySummary.upsert({
    where: { weekStart_weekEnd: { weekStart: start, weekEnd: end } },
    update: summary,
    create: { weekStart: start, weekEnd: end, ...summary },
  });
}

async function refreshSaleSummaries(tx: Tx, dates: Date[]) {
  const tokens = new Set<string>();
  for (const date of dates) {
    const token = startOfDay(date).toISOString();
    if (tokens.has(token)) continue;
    tokens.add(token);
    await refreshDailySummary(tx, date);
    await refreshWeeklySummary(tx, date);
  }
}

async function resolveSaleMasters(tx: Tx, input: SaleInput): Promise<ResolvedSaleInput> {
  let partyId = input.partyId || "";
  const partyName = cleanName(input.partyName);

  if (!partyId && partyName) {
    const existingParty = await tx.party.findFirst({
      where: { deletedAt: null, name: { equals: partyName, mode: "insensitive" } },
    });
    partyId = existingParty?.id ?? (await tx.party.create({ data: { name: partyName, isActive: true } })).id;
  }

  if (!partyId) throw new Error("Party Name is required.");

  let vehicleId = input.vehicleId || null;
  const vehicleNumber = normalizeVehicleNumber(input.vehicleNumber);
  if (!vehicleId && vehicleNumber) {
    const existingVehicle = await tx.vehicle.findFirst({
      where: { deletedAt: null, vehicleNumber: { equals: vehicleNumber, mode: "insensitive" } },
    });
    vehicleId =
      existingVehicle?.id ??
      (
        await tx.vehicle.create({
          data: {
            vehicleNumber,
            ownerName: partyName || null,
            partyId,
          },
        })
      ).id;
  }

  return { ...input, partyId, vehicleId };
}

function calculateSale(input: SaleInput) {
  const qty = decimal(input.qty);
  const rate = decimal(input.rate);

  if (!qty.gt(0)) throw new Error("Quantity must be greater than 0.");
  if (!rate.gt(0)) throw new Error("Rate must be greater than 0.");

  const grossAmount = money(qty.mul(rate));
  const providedGross = money(decimal(input.grossAmount));
  if (!grossAmount.equals(providedGross)) {
    throw new Error(`Gross Amount must equal Quantity x Rate. Expected ${formatCurrency(grossAmount)}.`);
  }

  const discountValue = input.discountValue == null || input.discountValue === "" ? null : decimal(input.discountValue);
  let discountAmount = new Decimal(0);
  if (input.discountType && discountValue) {
    if (discountValue.lt(0)) throw new Error("Discount cannot exceed the gross amount.");
    discountAmount =
      input.discountType === "PERCENTAGE"
        ? money(grossAmount.mul(discountValue).div(100))
        : money(discountValue);
  } else {
    discountAmount = money(decimal(input.discountAmount));
  }

  if (discountAmount.lt(0) || discountAmount.gt(grossAmount)) {
    throw new Error("Discount cannot exceed the gross amount.");
  }

  const providedDiscount = money(decimal(input.discountAmount));
  if (!providedDiscount.equals(discountAmount)) {
    throw new Error(`Discount Amount must be ${formatCurrency(discountAmount)}.`);
  }

  const netAmount = money(grossAmount.minus(discountAmount));
  const providedNet = money(decimal(input.netAmount));
  if (!netAmount.equals(providedNet)) {
    throw new Error(`Net Amount must equal Gross Amount minus Discount. Expected ${formatCurrency(netAmount)}.`);
  }

  const cashAmount = money(decimal(input.cashAmount));
  const bankAmount = money(decimal(input.bankAmount));
  const gpayAmount = money(decimal(input.gpayAmount));
  const creditAmount = money(decimal(input.creditAmount));
  const paymentTotal = money(cashAmount.plus(bankAmount).plus(gpayAmount).plus(creditAmount));

  if (!paymentTotal.equals(netAmount)) {
    throw new Error(paymentMismatch(paymentTotal, netAmount));
  }

  const nonNegative = [cashAmount, bankAmount, gpayAmount, creditAmount].every((amount) => amount.gte(0));
  if (!nonNegative) throw new Error(paymentMismatch(paymentTotal, netAmount));

  if (input.paymentType === "CASH" && (!cashAmount.equals(netAmount) || bankAmount.gt(0) || gpayAmount.gt(0) || creditAmount.gt(0))) {
    throw new Error(paymentMismatch(paymentTotal, netAmount));
  }
  if (input.paymentType === "BANK" && (!bankAmount.equals(netAmount) || cashAmount.gt(0) || gpayAmount.gt(0) || creditAmount.gt(0))) {
    throw new Error(paymentMismatch(paymentTotal, netAmount));
  }
  if (input.paymentType === "GPAY" && (!gpayAmount.equals(netAmount) || cashAmount.gt(0) || bankAmount.gt(0) || creditAmount.gt(0))) {
    throw new Error(paymentMismatch(paymentTotal, netAmount));
  }
  if (input.paymentType === "CREDIT" && (!creditAmount.equals(netAmount) || cashAmount.gt(0) || bankAmount.gt(0) || gpayAmount.gt(0))) {
    throw new Error(paymentMismatch(paymentTotal, netAmount));
  }

  return {
    qty,
    rate,
    grossAmount,
    discountValue,
    discountAmount,
    netAmount,
    cashAmount,
    bankAmount,
    gpayAmount,
    creditAmount,
  };
}

async function nextSaleNumber(tx: Tx) {
  const result = await tx.sale.aggregate({ _max: { slNo: true } });
  return (result._max.slNo ?? 0) + 1;
}

async function nextSlipNumber(tx: Tx, date: Date) {
  const prefix = `DS-${dayToken(date)}-`;
  const latest = await tx.dispatchSlip.findFirst({
    where: { slipNumber: { startsWith: prefix } },
    orderBy: { slipNumber: "desc" },
  });
  const latestNumber = latest ? Number(latest.slipNumber.slice(-4)) : 0;
  return `${prefix}${String(latestNumber + 1).padStart(4, "0")}`;
}

async function rebuildPartyLedger(tx: Tx, partyId: string) {
  const entries = await tx.ledgerEntry.findMany({
    where: { partyId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });

  let running = new Decimal(0);
  for (const entry of entries) {
    running = money(running.plus(entry.debitAmount).minus(entry.creditAmount));
    await tx.ledgerEntry.update({
      where: { id: entry.id },
      data: { runningBalance: running },
    });
  }

  await tx.party.update({
    where: { id: partyId },
    data: { currentBalance: running },
  });

  return running;
}

async function createAccountsCredit(
  tx: Tx,
  args: {
    date: Date;
    saleId: string;
    userId: string;
    type: "CASH" | "BANK" | "GPAY";
    amount: Prisma.Decimal;
  },
) {
  if (!args.amount.gt(0)) return;
  await tx.accountsEntry.create({
    data: {
      date: args.date,
      transactionType: args.type === "CASH" ? "CASH_SALE" : args.type === "BANK" ? "BANK_SALE" : "GPAY_SALE",
      refId: args.saleId,
      details: `${args.type} sale ${args.saleId}`,
      debit: "0",
      credit: args.amount,
      isCash: args.type === "CASH",
      isBank: args.type === "BANK",
      isGpay: args.type === "GPAY",
      createdBy: args.userId,
    },
  });
}

async function reverseSaleEffects(tx: Tx, saleId: string) {
  const sale = await tx.sale.findUnique({
    where: { id: saleId },
    include: { ledgerEntry: true },
  });

  if (!sale) throw new Error("Sale not found.");

  await tx.material.update({
    where: { id: sale.materialId },
    data: { currentStock: { increment: sale.qty } },
  });

  await tx.inventoryMovement.deleteMany({
    where: { refId: sale.id, type: "DISPATCH" },
  });

  await tx.accountsEntry.deleteMany({
    where: { refId: sale.id },
  });

  if (sale.ledgerEntry) {
    await tx.ledgerEntry.delete({ where: { id: sale.ledgerEntry.id } });
    await rebuildPartyLedger(tx, sale.partyId);
  }

  return sale;
}

async function applySaleEffects(
  tx: Tx,
  saleId: string,
  input: ResolvedSaleInput,
  amounts: ReturnType<typeof calculateSale>,
  userId: string,
  role: Role,
) {
  const material = await tx.material.findUnique({ where: { id: input.materialId } });
  if (!material || material.deletedAt || !material.isActive) throw new Error("Material not found.");

  const newStock = material.currentStock.minus(amounts.qty);
  if (newStock.lt(0) && !canAllowNegative(role, input.allowNegativeStock)) {
    throw new Error("Material stock cannot go negative.");
  }

  await tx.material.update({
    where: { id: input.materialId },
    data: { currentStock: newStock },
  });

  await tx.inventoryMovement.create({
    data: {
      materialId: input.materialId,
      type: "DISPATCH",
      qty: amounts.qty,
      refId: saleId,
      notes: "Sale dispatch",
    },
  });

  const date = toDate(input.date, input.time);

  if (amounts.creditAmount.gt(0)) {
    const party = await tx.party.findUnique({ where: { id: input.partyId } });
    if (!party || party.deletedAt) throw new Error("Party not found.");
    await tx.ledgerEntry.create({
      data: {
        partyId: input.partyId,
        saleId,
        date,
        description: `Credit sale ${saleId}`,
        debitAmount: amounts.creditAmount,
        creditAmount: "0",
        runningBalance: money(party.currentBalance.plus(amounts.creditAmount)),
        entryType: "SALE_CREDIT",
      },
    });
    await rebuildPartyLedger(tx, input.partyId);
  }

  await createAccountsCredit(tx, { date, saleId, userId, type: "CASH", amount: amounts.cashAmount });
  await createAccountsCredit(tx, { date, saleId, userId, type: "BANK", amount: amounts.bankAmount });
  await createAccountsCredit(tx, { date, saleId, userId, type: "GPAY", amount: amounts.gpayAmount });

  if (input.setAsNewDefault && input.vehicleId) {
    await tx.vehicle.update({
      where: { id: input.vehicleId },
      data: { defaultQty: amounts.qty },
    });
  }
}

export async function createSale(
  payload: SalePayload,
  user: { id: string; role: Role; name?: string | null },
  syncStatus: SyncStatus = "SYNCED",
) {
  const input = saleSchema.parse(payload);
  const amounts = calculateSale(input);
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    if (input.clientId) {
      const existing = await tx.sale.findUnique({
        where: { clientId: input.clientId },
        include: saleInclude,
      });
      if (existing) return existing;
    }

    const resolvedInput = await resolveSaleMasters(tx, input);
    const [vehicle, party, material, driver] = await Promise.all([
      resolvedInput.vehicleId ? tx.vehicle.findUnique({ where: { id: resolvedInput.vehicleId } }) : Promise.resolve(null),
      tx.party.findUnique({ where: { id: resolvedInput.partyId } }),
      tx.material.findUnique({ where: { id: resolvedInput.materialId } }),
      resolvedInput.driverId ? tx.driver.findUnique({ where: { id: resolvedInput.driverId } }) : Promise.resolve(null),
    ]);

    if (resolvedInput.vehicleId && (!vehicle || vehicle.deletedAt)) throw new Error("Vehicle not found.");
    if (!party || party.deletedAt || !party.isActive) throw new Error("Party Name is required.");
    if (!material || material.deletedAt || !material.isActive) throw new Error("Material not found.");
    if (resolvedInput.driverId && (!driver || driver.deletedAt)) throw new Error("Driver not found.");

    const date = toDate(resolvedInput.date, resolvedInput.time);
    const sale = await tx.sale.create({
      data: {
        clientId: resolvedInput.clientId,
        slNo: await nextSaleNumber(tx),
        date,
        time: resolvedInput.time,
        vehicleId: resolvedInput.vehicleId || null,
        partyId: resolvedInput.partyId,
        materialId: resolvedInput.materialId,
        driverId: resolvedInput.driverId || null,
        qty: amounts.qty,
        rate: amounts.rate,
        grossAmount: amounts.grossAmount,
        discountType: resolvedInput.discountType,
        discountValue: amounts.discountValue,
        discountAmount: amounts.discountAmount,
        netAmount: amounts.netAmount,
        paymentType: resolvedInput.paymentType,
        cashAmount: amounts.cashAmount,
        bankAmount: amounts.bankAmount,
        gpayAmount: amounts.gpayAmount,
        creditAmount: amounts.creditAmount,
        bankRef: resolvedInput.bankRef,
        remarks: resolvedInput.remarks,
        operatorName: resolvedInput.operatorName || user.name || null,
        syncStatus,
      },
    });

    await applySaleEffects(tx, sale.id, resolvedInput, amounts, user.id, user.role);
    await refreshSaleSummaries(tx, [date]);

    await tx.dispatchSlip.create({
      data: {
        slipNumber: await nextSlipNumber(tx, date),
        saleId: sale.id,
        driverId: resolvedInput.driverId || null,
      },
    });

    const after = await tx.sale.findUnique({ where: { id: sale.id }, include: saleInclude });
    await writeAudit(tx, {
      tableName: "Sale",
      recordId: sale.id,
      action: "CREATE",
      userId: user.id,
      after,
      saleId: sale.id,
    });

    return after;
  });
}

export async function updateSale(id: string, payload: SalePayload, user: { id: string; role: Role; name?: string | null }) {
  const input = saleSchema.parse(payload);
  const amounts = calculateSale(input);
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const before = await tx.sale.findUnique({ where: { id }, include: saleInclude });
    if (!before || before.deletedAt) throw new Error("Sale not found.");

    const resolvedInput = await resolveSaleMasters(tx, input);
    const nextDate = toDate(resolvedInput.date, resolvedInput.time);
    const [vehicle, party, material, driver] = await Promise.all([
      resolvedInput.vehicleId ? tx.vehicle.findUnique({ where: { id: resolvedInput.vehicleId } }) : Promise.resolve(null),
      tx.party.findUnique({ where: { id: resolvedInput.partyId } }),
      tx.material.findUnique({ where: { id: resolvedInput.materialId } }),
      resolvedInput.driverId ? tx.driver.findUnique({ where: { id: resolvedInput.driverId } }) : Promise.resolve(null),
    ]);
    if (resolvedInput.vehicleId && (!vehicle || vehicle.deletedAt)) throw new Error("Vehicle not found.");
    if (!party || party.deletedAt || !party.isActive) throw new Error("Party Name is required.");
    if (!material || material.deletedAt || !material.isActive) throw new Error("Material not found.");
    if (resolvedInput.driverId && (!driver || driver.deletedAt)) throw new Error("Driver not found.");
    await reverseSaleEffects(tx, id);
    const updated = await tx.sale.update({
      where: { id },
      data: {
        date: nextDate,
        time: resolvedInput.time,
        vehicleId: resolvedInput.vehicleId || null,
        partyId: resolvedInput.partyId,
        materialId: resolvedInput.materialId,
        driverId: resolvedInput.driverId || null,
        qty: amounts.qty,
        rate: amounts.rate,
        grossAmount: amounts.grossAmount,
        discountType: resolvedInput.discountType,
        discountValue: amounts.discountValue,
        discountAmount: amounts.discountAmount,
        netAmount: amounts.netAmount,
        paymentType: resolvedInput.paymentType,
        cashAmount: amounts.cashAmount,
        bankAmount: amounts.bankAmount,
        gpayAmount: amounts.gpayAmount,
        creditAmount: amounts.creditAmount,
        bankRef: resolvedInput.bankRef,
        remarks: resolvedInput.remarks,
        operatorName: resolvedInput.operatorName || user.name || before.operatorName,
      },
    });
    await applySaleEffects(tx, id, resolvedInput, amounts, user.id, user.role);
    await refreshSaleSummaries(tx, [before.date, nextDate]);
    const after = await tx.sale.findUnique({ where: { id: updated.id }, include: saleInclude });
    await writeAudit(tx, {
      tableName: "Sale",
      recordId: id,
      action: "UPDATE",
      userId: user.id,
      before,
      after,
      saleId: id,
    });
    return after;
  });
}

export async function deleteSale(id: string, user: { id: string }) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const before = await tx.sale.findUnique({ where: { id }, include: saleInclude });
    if (!before || before.deletedAt) throw new Error("Sale not found.");
    await reverseSaleEffects(tx, id);
    const after = await tx.sale.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: saleInclude,
    });
    await refreshSaleSummaries(tx, [before.date]);
    await writeAudit(tx, {
      tableName: "Sale",
      recordId: id,
      action: "DELETE",
      userId: user.id,
      before,
      after,
      saleId: id,
    });
    return after;
  });
}

export async function recordCreditPayment(payload: unknown, user: { id: string }) {
  const input = paymentSchema.parse(payload);
  const prisma = getPrisma();
  const amount = money(decimal(input.amount));
  if (!amount.gt(0)) throw new Error("Payment amount must be positive.");

  return prisma.$transaction(async (tx) => {
    const party = await tx.party.findUnique({ where: { id: input.partyId } });
    if (!party || party.deletedAt) throw new Error("Party not found.");
    const date = toDate(input.date);
    const entry = await tx.ledgerEntry.create({
      data: {
        partyId: input.partyId,
        date,
        description: input.details || `${input.method} payment received`,
        debitAmount: "0",
        creditAmount: amount,
        runningBalance: money(party.currentBalance.minus(amount)),
        entryType: "PAYMENT_RECEIVED",
      },
    });

    await tx.accountsEntry.create({
      data: {
        date,
        transactionType: "PAYMENT_RECEIVED",
        refId: entry.id,
        details: input.details || `Credit payment from ${party.name}`,
        debit: "0",
        credit: amount,
        isCash: input.method === "CASH",
        isBank: input.method === "BANK",
        isGpay: input.method === "GPAY",
        createdBy: user.id,
      },
    });

    await rebuildPartyLedger(tx, input.partyId);
    const after = await tx.ledgerEntry.findUnique({ where: { id: entry.id } });
    await writeAudit(tx, {
      tableName: "LedgerEntry",
      recordId: entry.id,
      action: "CREATE",
      userId: user.id,
      after,
    });
    return after;
  });
}

export const saleInclude = {
  vehicle: true,
  party: true,
  material: true,
  driver: true,
  ledgerEntry: true,
  dispatchSlip: {
    include: {
      driver: true,
    },
  },
} satisfies Prisma.SaleInclude;

export function dateWhere(date?: string | null, from?: string | null, to?: string | null) {
  if (date) {
    return { gte: startOfDay(date), lte: endOfDay(date) };
  }
  if (from || to) {
    return {
      ...(from ? { gte: startOfDay(from) } : {}),
      ...(to ? { lte: endOfDay(to) } : {}),
    };
  }
  return undefined;
}
