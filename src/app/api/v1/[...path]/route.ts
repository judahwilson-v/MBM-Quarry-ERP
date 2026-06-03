import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  accountsEntrySchema,
  driverSchema,
  employeeSchema,
  materialSchema,
  pendingBookSchema,
  partySchema,
  purchaseEntrySchema,
  purchaseSchema,
  productionSchema,
  reconciliationSchema,
  supplierSchema,
  vehicleSchema,
} from "@/lib/validation";
import {
  createSale,
  dateWhere,
  deleteSale,
  recordCreditPayment,
  saleInclude,
  updateSale,
} from "@/lib/sales-service";
import {
  errorJson,
  getSearchParams,
  handleApiError,
  json,
  parsePagination,
  requireApiSession,
} from "@/lib/api-utils";
import { writeAudit } from "@/lib/audit";
import { endOfDay, startOfDay, todayInputValue } from "@/lib/utils";

type RouteContext = {
  params: {
    path?: string[];
  };
};

type MasterName = "parties" | "vehicles" | "materials" | "drivers" | "suppliers" | "employees";

const Decimal = Prisma.Decimal;
const registerMaterials = ["6mm", "20mm", "40mm", "M-Sand", "P-Sand", "Dust"] as const;

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

export async function GET(request: Request, context: RouteContext) {
  return handleRequest("GET", request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return handleRequest("POST", request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  return handleRequest("PATCH", request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return handleRequest("DELETE", request, context);
}

async function handleRequest(method: string, request: Request, context: RouteContext) {
  try {
    const path = context.params.path ?? [];
    const [resource, id, action] = path;

    if (!resource) return errorJson("API route not found.", 404);

    if (isMasterName(resource)) {
      return handleMaster(method, request, resource, id, action);
    }

    if (resource === "sales") return handleSales(method, request, id);
    if (resource === "purchase-entries") return handlePurchaseEntries(method, request, id);
    if (resource === "purchases") return handlePurchases(method, request, id);
    if (resource === "pending-book") return handlePendingBook(method, request, id, action);
    if (resource === "credit") return handleCredit(method, request, id, action);
    if (resource === "accounts") return handleAccounts(method, request, id);
    if (resource === "dispatch") return handleDispatch(method, request, id, action);
    if (resource === "inventory") return handleInventory(method, request, id);
    if (resource === "dashboard") return handleDashboard();
    if (resource === "reports") return handleReports(request, id);
    if (resource === "audit") return handleAudit(request, id);
    if (resource === "reconciliation") return handleReconciliation(method, request, id);
    if (resource === "users") return handleUsers(method, request, id);

    return errorJson("API route not found.", 404);
  } catch (error) {
    return handleApiError(error);
  }
}

function isMasterName(value: string): value is MasterName {
  return ["parties", "vehicles", "materials", "drivers", "suppliers", "employees"].includes(value);
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function handleMaster(
  method: string,
  request: Request,
  resource: MasterName,
  id?: string,
  action?: string,
) {
  const prisma = getPrisma();
  const session = await requireApiSession(method === "GET" ? undefined : "masters");

  if (resource === "vehicles" && id && action === "default-qty" && method === "PATCH") {
    await requireApiSession("sales.add");
    const body = await readJson(request);
    const before = await prisma.vehicle.findUnique({ where: { id } });
    const after = await prisma.vehicle.update({
      where: { id },
      data: { defaultQty: body.defaultQty == null ? null : new Decimal(String(body.defaultQty)) },
    });
    await prisma.auditLog.create({
      data: {
        tableName: "Vehicle",
        recordId: id,
        action: "UPDATE",
        before: JSON.parse(JSON.stringify(before)),
        after: JSON.parse(JSON.stringify(after)),
        userId: session.user.id,
      },
    });
    return json(after);
  }

  if (resource === "materials" && id && action === "history" && method === "GET") {
    await requireApiSession();
    const rows = await prisma.materialPriceHistory.findMany({
      where: { materialId: id },
      orderBy: { changedAt: "desc" },
    });
    return json({ data: rows });
  }

  if (method === "GET") {
    const searchParams = getSearchParams(request);
    const { skip, take, page, pageSize } = parsePagination(searchParams);
    const search = searchParams.get("search")?.trim();
    const includeInactive = searchParams.get("includeInactive") === "true";
    const where = masterWhere(resource, search, includeInactive);
    const delegate = masterDelegate(resource);
    const include = masterInclude(resource);
    const [data, total] = await Promise.all([
      delegate.findMany({
        where,
        include,
        orderBy: resource === "vehicles" ? { vehicleNumber: "asc" } : { name: "asc" },
        skip,
        take,
      }),
      delegate.count({ where }),
    ]);
    return json({ data, meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) } });
  }

  const delegate = masterDelegate(resource);
  const tableName = tableNameForMaster(resource);

  if (method === "POST") {
    const body = await readJson(request);
    const data = parseMaster(resource, body);
    const created = await delegate.create({ data });
    const materialData = data as { currentRate?: string };
    if (resource === "materials" && Number(materialData.currentRate ?? 0) > 0) {
      await prisma.materialPriceHistory.create({
        data: {
          materialId: created.id,
          oldRate: "0",
          newRate: materialData.currentRate ?? "0",
          changedBy: session.user.name ?? session.user.email ?? session.user.id,
        },
      });
    }
    await writeAudit(getPrisma() as unknown as Prisma.TransactionClient, {
      tableName,
      recordId: created.id,
      action: "CREATE",
      userId: session.user.id,
      after: created,
    });
    return json(created, { status: 201 });
  }

  if (!id) return errorJson("Record id is required.", 400);

  if (method === "PATCH") {
    const body = await readJson(request);
    const before = await delegate.findUnique({ where: { id } });
    const data = parseMaster(resource, body);
    const after = await delegate.update({ where: { id }, data });
    const materialData = data as { currentRate?: string };
    if (
      resource === "materials" &&
      before &&
      materialData.currentRate != null &&
      !new Decimal(String(before.currentRate ?? 0)).equals(new Decimal(String(materialData.currentRate)))
    ) {
      await prisma.materialPriceHistory.create({
        data: {
          materialId: id,
          oldRate: before.currentRate ?? "0",
          newRate: materialData.currentRate,
          changedBy: session.user.name ?? session.user.email ?? session.user.id,
        },
      });
    }
    await getPrisma().auditLog.create({
      data: {
        tableName,
        recordId: id,
        action: "UPDATE",
        before: JSON.parse(JSON.stringify(before)),
        after: JSON.parse(JSON.stringify(after)),
        userId: session.user.id,
      },
    });
    return json(after);
  }

  if (method === "DELETE") {
    const before = await delegate.findUnique({ where: { id } });
    const after = await delegate.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        ...(["parties", "materials", "suppliers", "employees"].includes(resource) ? { isActive: false } : {}),
      },
    });
    await getPrisma().auditLog.create({
      data: {
        tableName,
        recordId: id,
        action: "DELETE",
        before: JSON.parse(JSON.stringify(before)),
        after: JSON.parse(JSON.stringify(after)),
        userId: session.user.id,
      },
    });
    return json(after);
  }

  return errorJson("Method not allowed.", 405);
}

function masterDelegate(resource: MasterName) {
  const prisma = getPrisma() as unknown as Record<string, any>;
  return {
    parties: prisma.party,
    vehicles: prisma.vehicle,
    materials: prisma.material,
    drivers: prisma.driver,
    suppliers: prisma.supplier,
    employees: prisma.employee,
  }[resource];
}

function masterInclude(resource: MasterName) {
  if (resource === "vehicles") return { party: true };
  if (resource === "drivers") return { vehicle: true };
  return undefined;
}

function masterWhere(resource: MasterName, search?: string, includeInactive?: boolean) {
  const deletedFilter = includeInactive ? {} : { deletedAt: null };
  if (!search) return deletedFilter;
  const contains = { contains: search, mode: "insensitive" as const };
  if (resource === "parties") {
    return {
      ...deletedFilter,
      OR: [{ name: contains }, { phone: contains }, { gstNumber: contains }],
    };
  }
  if (resource === "vehicles") {
    return {
      ...deletedFilter,
      OR: [{ vehicleNumber: contains }, { ownerName: contains }, { remarks: contains }, { bodyRemarks: contains }],
    };
  }
  if (resource === "materials") {
    return {
      ...deletedFilter,
      OR: [{ name: contains }, { code: contains }],
    };
  }
  if (resource === "suppliers") {
    return {
      ...deletedFilter,
      OR: [{ name: contains }, { phone: contains }, { gstNumber: contains }],
    };
  }
  if (resource === "employees") {
    return {
      ...deletedFilter,
      OR: [{ name: contains }, { role: contains }, { phone: contains }],
    };
  }
  return {
    ...deletedFilter,
    OR: [{ name: contains }, { mobile: contains }],
  };
}

function parseMaster(resource: MasterName, body: unknown) {
  if (resource === "parties") return partySchema.parse(body);
  if (resource === "vehicles") return vehicleSchema.parse(body);
  if (resource === "materials") return materialSchema.parse(body);
  if (resource === "drivers") return driverSchema.parse(body);
  if (resource === "suppliers") return supplierSchema.parse(body);
  return employeeSchema.parse(body);
}

function tableNameForMaster(resource: MasterName) {
  return {
    parties: "Party",
    vehicles: "Vehicle",
    materials: "Material",
    drivers: "Driver",
    suppliers: "Supplier",
    employees: "Employee",
  }[resource];
}

async function handleSales(method: string, request: Request, id?: string) {
  const prisma = getPrisma();

  if (id === "bulk-sync" && method === "POST") {
    const session = await requireApiSession("sales.add");
    const body = await readJson(request);
    const records: any[] = Array.isArray(body) ? body : body.records ?? [];
    const results = [];

    for (const record of records) {
      try {
        if ((record.type ?? "SALE") !== "SALE") throw new Error("Unsupported queue entry type.");
        const payload = record.payload ?? record;
        const sale = await createSale(payload, session.user, "SYNCED");
        results.push({
          id: record.id,
          clientId: payload.clientId,
          status: "SYNCED",
          serverId: sale?.id,
          slNo: sale?.slNo,
        });
      } catch (error) {
        results.push({
          id: record.id,
          clientId: record.payload?.clientId ?? record.clientId,
          status: "FAILED",
          error: error instanceof Error ? error.message : "Sync failed.",
        });
      }
    }

    return json({ results });
  }

  if (method === "GET") {
    await requireApiSession();
    const searchParams = getSearchParams(request);
    const { skip, take, page, pageSize } = parsePagination(searchParams);
    const where = {
      deletedAt: null,
      ...(dateWhere(searchParams.get("date"), searchParams.get("from"), searchParams.get("to"))
        ? { date: dateWhere(searchParams.get("date"), searchParams.get("from"), searchParams.get("to")) }
        : {}),
      ...(searchParams.get("partyId") ? { partyId: searchParams.get("partyId")! } : {}),
      ...(searchParams.get("vehicleId") ? { vehicleId: searchParams.get("vehicleId")! } : {}),
      ...(searchParams.get("materialId") ? { materialId: searchParams.get("materialId")! } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: saleInclude,
        orderBy: [{ date: "desc" }, { slNo: "desc" }],
        skip,
        take,
      }),
      prisma.sale.count({ where }),
    ]);

    return json({ data, summary: summarizeSales(data), meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) } });
  }

  if (method === "POST") {
    const session = await requireApiSession("sales.add");
    const sale = await createSale(await readJson(request), session.user);
    return json(sale, { status: 201 });
  }

  if (!id) return errorJson("Sale id is required.", 400);

  if (method === "PATCH") {
    const session = await requireApiSession("sales.mutate");
    return json(await updateSale(id, await readJson(request), session.user));
  }

  if (method === "DELETE") {
    const session = await requireApiSession("sales.mutate");
    return json(await deleteSale(id, session.user));
  }

  return errorJson("Method not allowed.", 405);
}

function summarizeSales(rows: any[]) {
  const materialBreakdown: Record<string, number> = Object.fromEntries(registerMaterials.map((material) => [material, 0]));
  const summary = rows.reduce(
    (acc, row) => {
      const amount = Number(row.netAmount);
      const qty = Number(row.qty);
      acc.totalQty += qty;
      acc.totalAmount += amount;
      acc.cash += Number(row.cashAmount ?? 0);
      acc.bank += Number(row.bankAmount ?? 0);
      acc.gpay += Number(row.gpayAmount ?? 0);
      acc.credit += Number(row.creditAmount ?? 0);
      const label = materialRegisterLabel(row.material);
      materialBreakdown[label] = (materialBreakdown[label] ?? 0) + qty;
      return acc;
    },
    { totalQty: 0, totalAmount: 0, cash: 0, bank: 0, gpay: 0, credit: 0 },
  );
  return { ...summary, cashSales: summary.cash + summary.bank + summary.gpay, creditSales: summary.credit, materialBreakdown };
}

async function resolveSupplier(input: { supplierId?: string | null; supplierName?: string | null }, tx: Prisma.TransactionClient) {
  if (input.supplierId) {
    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier || supplier.deletedAt) throw new Error("Supplier not found.");
    return supplier;
  }

  const supplierName = cleanName(input.supplierName);
  if (!supplierName) throw new Error("Supplier Name is required.");
  const existing = await tx.supplier.findFirst({
    where: { deletedAt: null, name: { equals: supplierName, mode: "insensitive" } },
  });
  return existing ?? tx.supplier.create({ data: { name: supplierName, isActive: true } });
}

async function resolveVehicle(input: { vehicleId?: string | null; vehicleNumber?: string | null }, tx: Prisma.TransactionClient) {
  if (input.vehicleId) {
    const vehicle = await tx.vehicle.findUnique({ where: { id: input.vehicleId } });
    if (!vehicle || vehicle.deletedAt) throw new Error("Vehicle not found.");
    return vehicle;
  }

  const vehicleNumber = normalizeVehicleNumber(input.vehicleNumber);
  if (!vehicleNumber) throw new Error("Vehicle Number is required.");
  const existing = await tx.vehicle.findFirst({
    where: { deletedAt: null, vehicleNumber: { equals: vehicleNumber, mode: "insensitive" } },
  });
  return existing ?? tx.vehicle.create({ data: { vehicleNumber } });
}

async function handlePurchaseEntries(method: string, request: Request, id?: string) {
  const prisma = getPrisma();

  if (method === "GET") {
    await requireApiSession("accounts");
    const searchParams = getSearchParams(request);
    const { skip, take, page, pageSize } = parsePagination(searchParams);
    const range = dateWhere(searchParams.get("date"), searchParams.get("from"), searchParams.get("to"));
    const where = {
      deletedAt: null,
      ...(range ? { date: range } : {}),
      ...(searchParams.get("supplierId") ? { supplierId: searchParams.get("supplierId")! } : {}),
      ...(searchParams.get("vehicleId") ? { vehicleId: searchParams.get("vehicleId")! } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.purchaseEntry.findMany({
        where,
        include: { supplier: true, vehicle: true },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip,
        take,
      }),
      prisma.purchaseEntry.count({ where }),
    ]);
    return json({ data, summary: summarizePurchaseEntries(data), meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) } });
  }

  if (method === "POST") {
    const session = await requireApiSession("accounts");
    const input = purchaseEntrySchema.parse(await readJson(request));
    const qty = new Decimal(input.qty).toDecimalPlaces(3);
    const rate = new Decimal(input.rate).toDecimalPlaces(2);
    const amount = new Decimal(input.amount).toDecimalPlaces(2);
    if (!qty.gt(0)) throw new Error("Quantity must be greater than 0.");
    if (!rate.gt(0)) throw new Error("Rate must be greater than 0.");
    const expected = qty.mul(rate).toDecimalPlaces(2);
    if (!expected.equals(amount)) throw new Error(`Amount must equal Quantity x Rate. Expected ${expected.toFixed(2)}.`);

    const created = await prisma.$transaction(async (tx) => {
      const [supplier, vehicle] = await Promise.all([resolveSupplier(input, tx), resolveVehicle(input, tx)]);
      const date = new Date(input.date);
      if (input.time && /^\d{2}:\d{2}/.test(input.time)) {
        const [hours, minutes] = input.time.split(":").map(Number);
        date.setHours(hours, minutes, 0, 0);
      }
      const entry = await tx.purchaseEntry.create({
        data: {
          date,
          time: input.time,
          vehicleId: vehicle.id,
          vehicleNumber: vehicle.vehicleNumber,
          supplierId: supplier.id,
          supplierName: supplier.name,
          material: cleanName(input.material),
          qty,
          rate,
          amount,
          remarks: input.remarks,
        },
        include: { supplier: true, vehicle: true },
      });
      await writeAudit(tx, {
        tableName: "PurchaseEntry",
        recordId: entry.id,
        action: "CREATE",
        userId: session.user.id,
        after: entry,
      });
      return entry;
    });

    return json(created, { status: 201 });
  }

  if (!id) return errorJson("Purchase entry id is required.", 400);

  if (method === "DELETE") {
    const session = await requireApiSession("accounts");
    const deleted = await prisma.$transaction(async (tx) => {
      const before = await tx.purchaseEntry.findUnique({ where: { id }, include: { supplier: true, vehicle: true } });
      if (!before || before.deletedAt) throw new Error("Purchase entry not found.");
      const after = await tx.purchaseEntry.update({
        where: { id },
        data: { deletedAt: new Date() },
        include: { supplier: true, vehicle: true },
      });
      await writeAudit(tx, {
        tableName: "PurchaseEntry",
        recordId: id,
        action: "DELETE",
        userId: session.user.id,
        before,
        after,
      });
      return after;
    });
    return json(deleted);
  }

  return errorJson("Method not allowed.", 405);
}

function summarizePurchaseEntries(rows: any[]) {
  return rows.reduce(
    (acc, row) => {
      const qty = Number(row.qty ?? 0);
      const amount = Number(row.amount ?? 0);
      const material = row.material ?? "Boulder";
      const supplier = row.supplierName ?? row.supplier?.name ?? "Unknown";
      acc.totalQty += qty;
      acc.totalAmount += amount;
      acc.byMaterial[material] = (acc.byMaterial[material] ?? 0) + qty;
      acc.bySupplier[supplier] = (acc.bySupplier[supplier] ?? 0) + amount;
      return acc;
    },
    { totalQty: 0, totalAmount: 0, byMaterial: {} as Record<string, number>, bySupplier: {} as Record<string, number> },
  );
}

async function handlePurchases(method: string, request: Request, id?: string) {
  const prisma = getPrisma();

  if (method === "GET") {
    await requireApiSession("accounts");
    const searchParams = getSearchParams(request);
    const { skip, take, page, pageSize } = parsePagination(searchParams);
    const range = dateWhere(searchParams.get("date"), searchParams.get("from"), searchParams.get("to"));
    const where = {
      deletedAt: null,
      ...(range ? { date: range } : {}),
      ...(searchParams.get("category") ? { category: searchParams.get("category") as any } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        include: { supplier: true, material: true },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip,
        take,
      }),
      prisma.purchase.count({ where }),
    ]);
    return json({ data, summary: summarizePurchases(data), meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) } });
  }

  if (method === "POST") {
    const session = await requireApiSession("accounts");
    const input = purchaseSchema.parse(await readJson(request));
    const amount = new Decimal(input.amount).toDecimalPlaces(2);
    if (!amount.gt(0)) throw new Error("Amount must be greater than 0.");
    const qty = input.qty ? new Decimal(input.qty) : null;
    const rate = input.rate ? new Decimal(input.rate) : null;
    if (qty && rate) {
      const expected = qty.mul(rate).toDecimalPlaces(2);
      if (!expected.equals(amount)) throw new Error(`Amount must equal Quantity x Rate. Expected ${expected.toFixed(2)}.`);
    }

    const created = await prisma.$transaction(async (tx) => {
      const supplier = input.supplierId || input.supplierName ? await resolveSupplier(input, tx) : null;
      const purchase = await tx.purchase.create({
        data: {
          date: new Date(input.date),
          category: input.category,
          supplierId: supplier?.id ?? null,
          materialId: input.materialId || null,
          description: input.description,
          qty,
          unit: input.unit || (input.category === "MATERIAL" ? "CFT" : null),
          rate,
          amount,
          paymentType: input.paymentType,
          invoiceRef: input.invoiceRef,
          remarks: input.remarks,
        },
        include: { supplier: true, material: true },
      });

      await tx.accountsEntry.create({
        data: {
          date: purchase.date,
          transactionType: purchaseTransactionType(input.category),
          refId: purchase.id,
          details: purchase.description,
          debit: amount,
          credit: "0",
          isCash: input.paymentType === "CASH",
          isBank: input.paymentType === "BANK",
          isGpay: input.paymentType === "GPAY",
          createdBy: session.user.id,
        },
      });

      if (input.category === "MATERIAL" && input.materialId && qty?.gt(0)) {
        await tx.material.update({
          where: { id: input.materialId },
          data: { currentStock: { increment: qty } },
        });
        await tx.inventoryMovement.create({
          data: {
            materialId: input.materialId,
            type: "PURCHASE",
            qty,
            refId: purchase.id,
            notes: purchase.description,
          },
        });
      }

      await writeAudit(tx, {
        tableName: "Purchase",
        recordId: purchase.id,
        action: "CREATE",
        userId: session.user.id,
        after: purchase,
      });
      return purchase;
    });
    return json(created, { status: 201 });
  }

  if (!id) return errorJson("Purchase id is required.", 400);

  if (method === "DELETE") {
    const session = await requireApiSession("accounts");
    const deleted = await prisma.$transaction(async (tx) => {
      const before = await tx.purchase.findUnique({ where: { id }, include: { material: true, supplier: true } });
      if (!before || before.deletedAt) throw new Error("Purchase not found.");
      if (before.materialId && before.qty) {
        await tx.material.update({
          where: { id: before.materialId },
          data: { currentStock: { decrement: before.qty } },
        });
        await tx.inventoryMovement.deleteMany({ where: { refId: id, type: "PURCHASE" } });
      }
      await tx.accountsEntry.deleteMany({ where: { refId: id } });
      const after = await tx.purchase.update({
        where: { id },
        data: { deletedAt: new Date() },
        include: { material: true, supplier: true },
      });
      await writeAudit(tx, {
        tableName: "Purchase",
        recordId: id,
        action: "DELETE",
        userId: session.user.id,
        before,
        after,
      });
      return after;
    });
    return json(deleted);
  }

  return errorJson("Method not allowed.", 405);
}

function purchaseTransactionType(category: string) {
  if (category === "DIESEL") return "DIESEL_EXPENSE";
  if (category === "MAINTENANCE") return "MAINTENANCE";
  if (category === "SALARY") return "SALARY";
  return "PURCHASE";
}

function summarizePurchases(rows: any[]) {
  return rows.reduce(
    (acc, row) => {
      const amount = Number(row.amount ?? 0);
      acc.total += amount;
      acc.byCategory[row.category] = (acc.byCategory[row.category] ?? 0) + amount;
      return acc;
    },
    { total: 0, byCategory: {} as Record<string, number> },
  );
}

async function handlePendingBook(method: string, request: Request, id?: string, action?: string) {
  const prisma = getPrisma();

  if (method === "GET") {
    await requireApiSession("accounts");
    const searchParams = getSearchParams(request);
    const where = {
      ...(searchParams.get("employeeId") ? { employeeId: searchParams.get("employeeId")! } : {}),
      ...(searchParams.get("status") === "pending" ? { isDeducted: false } : {}),
      ...(dateWhere(searchParams.get("date"), searchParams.get("from"), searchParams.get("to"))
        ? { date: dateWhere(searchParams.get("date"), searchParams.get("from"), searchParams.get("to")) }
        : {}),
    };
    const rows = await prisma.pendingBook.findMany({
      where,
      include: { employee: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    return json({ data: rows, summary: summarizePending(rows) });
  }

  if (method === "POST" && id === "process-deductions") {
    const session = await requireApiSession("accounts");
    const body = await readJson(request);
    const employeeId = typeof body.employeeId === "string" ? body.employeeId : undefined;
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.pendingBook.findMany({
        where: { isDeducted: false, ...(employeeId ? { employeeId } : {}) },
        include: { employee: true },
      });
      const now = new Date();
      await tx.pendingBook.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: { isDeducted: true, deductedOn: now },
      });
      await writeAudit(tx, {
        tableName: "PendingBook",
        recordId: employeeId ?? "all",
        action: "UPDATE",
        userId: session.user.id,
        before: rows,
        after: { deductedOn: now, count: rows.length },
      });
      return { count: rows.length, total: rows.reduce((sum, row) => sum.plus(row.amount), new Decimal(0)) };
    });
    return json(result);
  }

  if (method === "POST") {
    const session = await requireApiSession("accounts");
    const input = pendingBookSchema.parse(await readJson(request));
    const amount = new Decimal(input.amount).toDecimalPlaces(2);
    if (!amount.gt(0)) throw new Error("Amount must be greater than 0.");
    const created = await prisma.pendingBook.create({
      data: {
        employeeId: input.employeeId,
        date: new Date(input.date),
        amount,
        reason: input.reason,
        notes: input.notes,
      },
      include: { employee: true },
    });
    await prisma.auditLog.create({
      data: {
        tableName: "PendingBook",
        recordId: created.id,
        action: "CREATE",
        after: JSON.parse(JSON.stringify(created)),
        userId: session.user.id,
      },
    });
    return json(created, { status: 201 });
  }

  if (method === "PATCH" && id && action === "deducted") {
    const session = await requireApiSession("accounts");
    const before = await prisma.pendingBook.findUnique({ where: { id } });
    const after = await prisma.pendingBook.update({
      where: { id },
      data: { isDeducted: true, deductedOn: new Date() },
      include: { employee: true },
    });
    await prisma.auditLog.create({
      data: {
        tableName: "PendingBook",
        recordId: id,
        action: "UPDATE",
        before: JSON.parse(JSON.stringify(before)),
        after: JSON.parse(JSON.stringify(after)),
        userId: session.user.id,
      },
    });
    return json(after);
  }

  return errorJson("Method not allowed.", 405);
}

function summarizePending(rows: any[]) {
  const byEmployee: Record<string, { employee: any; totalPending: number }> = {};
  for (const row of rows) {
    if (row.isDeducted) continue;
    const key = row.employeeId;
    byEmployee[key] ??= { employee: row.employee, totalPending: 0 };
    byEmployee[key].totalPending += Number(row.amount ?? 0);
  }
  return {
    totalPending: Object.values(byEmployee).reduce((sum, row) => sum + row.totalPending, 0),
    byEmployee: Object.values(byEmployee),
  };
}

async function handleCredit(method: string, request: Request, id?: string, action?: string) {
  const prisma = getPrisma();

  if (method === "POST" && id === "payment") {
    const session = await requireApiSession("ledger");
    return json(await recordCreditPayment(await readJson(request), session.user), { status: 201 });
  }

  await requireApiSession("ledger");

  if (method !== "GET") return errorJson("Method not allowed.", 405);

  if (id === "ledger" && action) {
    const party = await prisma.party.findUnique({ where: { id: action } });
    const entries = await prisma.ledgerEntry.findMany({
      where: { partyId: action },
      include: {
        sale: {
          include: {
            vehicle: true,
            material: true,
          },
        },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    return json({
      party,
      rows: [
        {
          id: "opening",
          date: party?.createdAt,
          description: "Opening balance",
          debitAmount: 0,
          creditAmount: 0,
          runningBalance: 0,
        },
        ...entries,
      ],
    });
  }

  if (id === "outstanding" || id === "list") {
    const searchParams = getSearchParams(request);
    const threshold = Number(searchParams.get("threshold") ?? 0);
    const rows = await outstandingRows(threshold);
    return json({ data: rows });
  }

  if (id === "ageing") {
    const asOf = getSearchParams(request).get("asOf") ?? todayInputValue();
    return json({ data: await ageingRows(asOf) });
  }

  return errorJson("Credit route not found.", 404);
}

async function outstandingRows(threshold = 0) {
  const prisma = getPrisma();
  const parties = await prisma.party.findMany({
    where: { deletedAt: null, currentBalance: { gt: 0 } },
    include: { ledgerEntries: { orderBy: { date: "desc" }, take: 1 } },
    orderBy: { currentBalance: "desc" },
  });
  const now = Date.now();
  return parties
    .map((party) => {
      const lastDate = party.ledgerEntries[0]?.date ?? party.createdAt;
      const daysOverdue = Math.max(Math.floor((now - lastDate.getTime()) / 86400000), 0);
      return {
        party,
        totalOutstanding: party.currentBalance,
        lastTransactionDate: lastDate,
        daysOverdue,
      };
    })
    .filter((row) => row.daysOverdue >= threshold);
}

async function ageingRows(asOfInput: string) {
  const prisma = getPrisma();
  const asOf = endOfDay(asOfInput);
  const parties = await prisma.party.findMany({
    where: { deletedAt: null },
    include: { ledgerEntries: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] } },
  });

  return parties
    .map((party) => {
      let creditPool = party.ledgerEntries.reduce(
        (sum, entry) => sum.plus(entry.creditAmount),
        new Decimal(0),
      );
      const buckets = { b0_30: new Decimal(0), b31_60: new Decimal(0), b61_90: new Decimal(0), b90: new Decimal(0) };

      for (const entry of party.ledgerEntries) {
        let remaining = new Decimal(entry.debitAmount);
        if (!remaining.gt(0)) continue;
        const applied = Decimal.min(remaining, creditPool);
        remaining = remaining.minus(applied);
        creditPool = creditPool.minus(applied);
        if (!remaining.gt(0)) continue;
        const age = Math.max(Math.floor((asOf.getTime() - entry.date.getTime()) / 86400000), 0);
        if (age <= 30) buckets.b0_30 = buckets.b0_30.plus(remaining);
        else if (age <= 60) buckets.b31_60 = buckets.b31_60.plus(remaining);
        else if (age <= 90) buckets.b61_90 = buckets.b61_90.plus(remaining);
        else buckets.b90 = buckets.b90.plus(remaining);
      }

      const total = buckets.b0_30.plus(buckets.b31_60).plus(buckets.b61_90).plus(buckets.b90);
      return { party, ...buckets, total };
    })
    .filter((row) => row.total.gt(0));
}

async function handleAccounts(method: string, request: Request, id?: string) {
  const prisma = getPrisma();

  if (id === "reconciliation" && method === "GET") {
    await requireApiSession("accounts");
    const date = getSearchParams(request).get("date") ?? todayInputValue();
    const range = { gte: startOfDay(date), lte: endOfDay(date) };
    const [cashSales, bankSales, gpaySales, cashAccounts, bankAccounts, gpayAccounts] = await Promise.all([
      prisma.sale.aggregate({ where: { deletedAt: null, date: range }, _sum: { cashAmount: true } }),
      prisma.sale.aggregate({ where: { deletedAt: null, date: range }, _sum: { bankAmount: true } }),
      prisma.sale.aggregate({ where: { deletedAt: null, date: range }, _sum: { gpayAmount: true } }),
      prisma.accountsEntry.findMany({ where: { isCash: true, date: range } }),
      prisma.accountsEntry.findMany({ where: { isBank: true, date: range } }),
      prisma.accountsEntry.findMany({ where: { isGpay: true, date: range } }),
    ]);
    const cashAccountTotal = cashAccounts.reduce((sum, row) => sum.plus(row.credit).minus(row.debit), new Decimal(0));
    const bankAccountTotal = bankAccounts.reduce((sum, row) => sum.plus(row.credit).minus(row.debit), new Decimal(0));
    const gpayAccountTotal = gpayAccounts.reduce((sum, row) => sum.plus(row.credit).minus(row.debit), new Decimal(0));
    const cashSaleTotal = new Decimal(cashSales._sum.cashAmount ?? 0);
    const bankSaleTotal = new Decimal(bankSales._sum.bankAmount ?? 0);
    const gpaySaleTotal = new Decimal(gpaySales._sum.gpayAmount ?? 0);
    return json({
      date,
      cash: {
        sales: cashSaleTotal,
        accounts: cashAccountTotal,
        delta: cashAccountTotal.minus(cashSaleTotal),
        balanced: cashAccountTotal.equals(cashSaleTotal),
      },
      bank: {
        sales: bankSaleTotal,
        accounts: bankAccountTotal,
        delta: bankAccountTotal.minus(bankSaleTotal),
        balanced: bankAccountTotal.equals(bankSaleTotal),
      },
      gpay: {
        sales: gpaySaleTotal,
        accounts: gpayAccountTotal,
        delta: gpayAccountTotal.minus(gpaySaleTotal),
        balanced: gpayAccountTotal.equals(gpaySaleTotal),
      },
    });
  }

  if (method === "GET") {
    await requireApiSession("accounts");
    const searchParams = getSearchParams(request);
    const { skip, take, page, pageSize } = parsePagination(searchParams);
    const book = searchParams.get("book");
    const where = {
      ...(book === "cash" ? { isCash: true } : {}),
      ...(book === "bank" ? { isBank: true } : {}),
      ...(book === "gpay" ? { isGpay: true } : {}),
      ...(dateWhere(searchParams.get("date"), searchParams.get("from"), searchParams.get("to"))
        ? { date: dateWhere(searchParams.get("date"), searchParams.get("from"), searchParams.get("to")) }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.accountsEntry.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip, take }),
      prisma.accountsEntry.count({ where }),
    ]);
    let running = new Decimal(0);
    const data = [...rows]
      .reverse()
      .map((row) => {
        running = running.plus(row.credit).minus(row.debit);
        return { ...row, runningBalance: running };
      })
      .reverse();
    return json({ data, meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) } });
  }

  if (method === "POST") {
    const session = await requireApiSession("accounts");
    const input = accountsEntrySchema.parse(await readJson(request));
    const created = await prisma.accountsEntry.create({
      data: {
        ...input,
        date: new Date(input.date),
        debit: new Decimal(input.debit),
        credit: new Decimal(input.credit),
        createdBy: session.user.id,
      },
    });
    await prisma.auditLog.create({
      data: {
        tableName: "AccountsEntry",
        recordId: created.id,
        action: "CREATE",
        after: JSON.parse(JSON.stringify(created)),
        userId: session.user.id,
      },
    });
    return json(created, { status: 201 });
  }

  return errorJson("Method not allowed.", 405);
}

async function handleDispatch(method: string, request: Request, id?: string, action?: string) {
  const prisma = getPrisma();
  await requireApiSession("sales.add");
  if (!id) return errorJson("Slip id is required.", 400);

  if (method === "GET") {
    const slip = await prisma.dispatchSlip.findFirst({
      where: { OR: [{ id }, { slipNumber: id }] },
      include: {
        driver: true,
        sale: {
          include: {
            vehicle: true,
            party: true,
            material: true,
          },
        },
      },
    });
    if (!slip) return errorJson("Dispatch slip not found.", 404);
    return json(slip);
  }

  if (method === "POST" && action === "print") {
    const slip = await prisma.$transaction(async (tx) => {
      const updated = await tx.dispatchSlip.update({
        where: { id },
        data: { printCount: { increment: 1 } },
      });
      await tx.sale.update({
        where: { id: updated.saleId },
        data: { printCount: { increment: 1 } },
      });
      return updated;
    });
    return json(slip);
  }

  return errorJson("Method not allowed.", 405);
}

async function handleInventory(method: string, request: Request, id?: string) {
  const prisma = getPrisma();

  if (id === "stock" && method === "GET") {
    await requireApiSession();
    const materials = await prisma.material.findMany({
      where: { deletedAt: null },
      include: { inventoryMovements: true },
      orderBy: { code: "asc" },
    });
    return json({
      data: materials.map((material) => {
        const production = material.inventoryMovements
          .filter((movement) => movement.type === "PRODUCTION")
          .reduce((sum, movement) => sum.plus(movement.qty), new Decimal(0));
        const dispatched = material.inventoryMovements
          .filter((movement) => movement.type === "DISPATCH")
          .reduce((sum, movement) => sum.plus(movement.qty), new Decimal(0));
        const opening = material.currentStock.minus(production).plus(dispatched);
        const status = material.currentStock.lte(0)
          ? "Critical"
          : material.currentStock.lte(material.reorderLevel)
            ? "Low"
            : "OK";
        return { material, opening, production, dispatched, currentStock: material.currentStock, status };
      }),
    });
  }

  if (id === "production" && method === "POST") {
    const session = await requireApiSession("inventory");
    const input = productionSchema.parse(await readJson(request));
    const qty = new Decimal(input.qty);
    if (!qty.gt(0)) throw new Error("Production qty must be positive.");
    const result = await prisma.$transaction(async (tx) => {
      const movement = await tx.inventoryMovement.create({
        data: {
          materialId: input.materialId,
          type: "PRODUCTION",
          qty,
          notes: input.notes,
        },
      });
      const material = await tx.material.update({
        where: { id: input.materialId },
        data: { currentStock: { increment: qty } },
      });
      await writeAudit(tx, {
        tableName: "InventoryMovement",
        recordId: movement.id,
        action: "CREATE",
        userId: session.user.id,
        after: movement,
      });
      return { movement, material };
    });
    return json(result, { status: 201 });
  }

  if (method === "GET") {
    await requireApiSession("inventory");
    const searchParams = getSearchParams(request);
    const { skip, take, page, pageSize } = parsePagination(searchParams);
    const [data, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        include: { material: true },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.inventoryMovement.count(),
    ]);
    return json({ data, meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) } });
  }

  return errorJson("Inventory route not found.", 404);
}

async function handleDashboard() {
  const prisma = getPrisma();
  await requireApiSession();
  const today = todayInputValue();
  const todayRange = { gte: startOfDay(today), lte: endOfDay(today) };
  const last30 = startOfDay(new Date(Date.now() - 29 * 86400000));
  const last7 = startOfDay(new Date(Date.now() - 6 * 86400000));

  const [todaySales, outstanding, stock, trendSales, materialTrendSales, recentSales] = await Promise.all([
    prisma.sale.findMany({ where: { deletedAt: null, date: todayRange }, include: { material: true } }),
    prisma.party.aggregate({ where: { deletedAt: null }, _sum: { currentBalance: true } }),
    prisma.material.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } }),
    prisma.sale.findMany({ where: { deletedAt: null, date: { gte: last30 } }, orderBy: { date: "asc" } }),
    prisma.sale.findMany({
      where: { deletedAt: null, date: { gte: last7 } },
      include: { material: true },
      orderBy: { date: "asc" },
    }),
    prisma.sale.findMany({
      where: { deletedAt: null },
      include: { vehicle: true, party: true, material: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 10,
    }),
  ]);

  return json({
    stats: {
      todayTotalSales: sumAmounts(todaySales),
      todayCash: sumField(todaySales, "cashAmount"),
      todayBank: sumField(todaySales, "bankAmount").plus(sumField(todaySales, "gpayAmount")),
      todayCredit: sumField(todaySales, "creditAmount"),
      totalOutstanding: outstanding._sum.currentBalance ?? 0,
      totalTrucksToday: todaySales.length,
    },
    materialToday: materialBreakdown(todaySales),
    dailySalesTrend: salesTrend(trendSales),
    materialDispatchTrend: materialTrend(materialTrendSales),
    outstandingTrend: [],
    recentSales,
    stockSummary: stock.map((material) => ({
      material,
      status: material.currentStock.lte(0) ? "Critical" : material.currentStock.lte(material.reorderLevel) ? "Low" : "OK",
    })),
  });
}

function sumAmounts(rows: Array<{ netAmount: Prisma.Decimal }>) {
  return rows.reduce((sum, row) => sum.plus(row.netAmount), new Decimal(0));
}

function sumField(rows: any[], field: string) {
  return rows.reduce((sum, row) => sum.plus(row[field] ?? 0), new Decimal(0));
}

function materialBreakdown(rows: any[]) {
  return rows.reduce((acc: Record<string, number>, row) => {
    const code = row.material?.code ?? "UNKNOWN";
    acc[code] = (acc[code] ?? 0) + Number(row.qty);
    return acc;
  }, {});
}

function salesTrend(rows: any[]) {
  const result: Record<string, { date: string; cash: number; bank: number; gpay: number; credit: number }> = {};
  for (const row of rows) {
    const date = row.date.toISOString().slice(0, 10);
    result[date] ??= { date, cash: 0, bank: 0, gpay: 0, credit: 0 };
    result[date].cash += Number(row.cashAmount ?? 0);
    result[date].bank += Number(row.bankAmount ?? 0);
    result[date].gpay += Number(row.gpayAmount ?? 0);
    result[date].credit += Number(row.creditAmount ?? 0);
  }
  return Object.values(result);
}

function materialTrend(rows: any[]) {
  const result: Record<string, Record<string, number | string>> = {};
  for (const row of rows) {
    const date = row.date.toISOString().slice(0, 10);
    const code = row.material?.code ?? "UNKNOWN";
    result[date] ??= { date };
    result[date][code] = Number(result[date][code] ?? 0) + Number(row.qty);
  }
  return Object.values(result);
}

async function handleReports(request: Request, reportType?: string) {
  const prisma = getPrisma();
  await requireApiSession("reports");
  if (!reportType) return errorJson("Report type is required.", 400);
  const searchParams = getSearchParams(request);
  const range = dateWhere(searchParams.get("date"), searchParams.get("from"), searchParams.get("to"));

  if (["daily-sales", "weekly-sales", "monthly-sales", "party-wise-sales", "vehicle-wise-sales", "material-wise-sales"].includes(reportType)) {
    const rows = await prisma.sale.findMany({
      where: {
        deletedAt: null,
        ...(range ? { date: range } : {}),
        ...(searchParams.get("partyId") ? { partyId: searchParams.get("partyId")! } : {}),
        ...(searchParams.get("vehicleId") ? { vehicleId: searchParams.get("vehicleId")! } : {}),
        ...(searchParams.get("materialId") ? { materialId: searchParams.get("materialId")! } : {}),
      },
      include: { vehicle: true, party: true, material: true, driver: true },
      orderBy: [{ date: "asc" }, { slNo: "asc" }],
    });
    return json({ data: rows, summary: summarizeSales(rows), reportType });
  }

  if (reportType === "boulder-purchase-report") {
    const rows = await prisma.purchaseEntry.findMany({
      where: { deletedAt: null, ...(range ? { date: range } : {}) },
      include: { supplier: true, vehicle: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    return json({ data: rows, summary: summarizePurchaseEntries(rows), reportType });
  }

  if (reportType === "daily-purchases") {
    const rows = await prisma.purchase.findMany({
      where: { deletedAt: null, ...(range ? { date: range } : {}) },
      include: { supplier: true, material: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    return json({ data: rows, summary: summarizePurchases(rows), reportType });
  }

  if (reportType === "vehicle-report") {
    const rows = await prisma.sale.findMany({
      where: { deletedAt: null, ...(range ? { date: range } : {}) },
      include: { vehicle: true },
    });
    const grouped = Object.values(
      rows.reduce((acc: Record<string, any>, row) => {
        const key = row.vehicleId ?? "unknown";
        acc[key] ??= {
          vehicle: row.vehicle?.vehicleNumber ?? "No vehicle",
          companyBody: row.vehicle?.companyBody ?? false,
          extraBody: row.vehicle?.extraBody ?? false,
          isPickup: row.vehicle?.isPickup ?? false,
          trips: 0,
          totalQty: 0,
          totalAmount: 0,
        };
        acc[key].trips += 1;
        acc[key].totalQty += Number(row.qty);
        acc[key].totalAmount += Number(row.netAmount);
        return acc;
      }, {}),
    );
    return json({ data: grouped, reportType });
  }

  if (reportType === "material-report" || reportType === "material-wise-report") {
    const rows = await prisma.sale.findMany({
      where: { deletedAt: null, ...(range ? { date: range } : {}) },
      include: { material: true },
    });
    const grouped = Object.values(
      rows.reduce((acc: Record<string, any>, row) => {
        const key = row.materialId;
        acc[key] ??= { material: row.material.name, code: row.material.code, qty: 0, revenue: 0 };
        acc[key].qty += Number(row.qty);
        acc[key].revenue += Number(row.netAmount);
        return acc;
      }, {}),
    );
    return json({ data: grouped, reportType });
  }

  if (reportType === "pending-book-report") {
    const rows = await prisma.pendingBook.findMany({
      where: { ...(range ? { date: range } : {}) },
      include: { employee: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    return json({ data: summarizePending(rows).byEmployee, summary: summarizePending(rows), reportType });
  }

  if (reportType === "credit-report") {
    const partyId = searchParams.get("partyId");
    const rows = await prisma.ledgerEntry.findMany({
      where: { ...(partyId ? { partyId } : {}), ...(range ? { date: range } : {}) },
      include: { party: true, sale: { include: { vehicle: true, material: true } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    return json({ data: rows, reportType });
  }

  if (reportType === "customer-ledger") {
    const partyId = searchParams.get("partyId");
    const rows = await prisma.ledgerEntry.findMany({
      where: { ...(partyId ? { partyId } : {}), ...(range ? { date: range } : {}) },
      include: { party: true, sale: { include: { vehicle: true, material: true } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    return json({ data: rows, reportType });
  }

  if (reportType === "supplier-ledger") {
    const supplierId = searchParams.get("supplierId");
    const rows = await prisma.purchaseEntry.findMany({
      where: { deletedAt: null, ...(supplierId ? { supplierId } : {}), ...(range ? { date: range } : {}) },
      include: { supplier: true, vehicle: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    return json({ data: rows, summary: summarizePurchaseEntries(rows), reportType });
  }

  if (reportType === "outstanding-report") return json({ data: await outstandingRows(0), reportType });
  if (reportType === "ageing-report") return json({ data: await ageingRows(searchParams.get("asOf") ?? todayInputValue()), reportType });

  if (reportType === "expense-report") {
    const rows = await prisma.accountsEntry.findMany({
      where: { debit: { gt: 0 }, ...(range ? { date: range } : {}) },
      orderBy: { date: "asc" },
    });
    return json({ data: rows, reportType });
  }

  if (reportType === "stock-report") {
    const materials = await prisma.material.findMany({ include: { inventoryMovements: true }, orderBy: { code: "asc" } });
    return json({ data: materials, reportType });
  }

  return errorJson("Report type not found.", 404);
}

async function handleAudit(request: Request, recordId?: string) {
  const prisma = getPrisma();
  await requireApiSession("audit");
  const searchParams = getSearchParams(request);
  const where = {
    ...(recordId ? { recordId } : {}),
    ...(searchParams.get("table") ? { tableName: searchParams.get("table")! } : {}),
    ...(searchParams.get("userId") ? { userId: searchParams.get("userId")! } : {}),
    ...(dateWhere(null, searchParams.get("from"), searchParams.get("to"))
      ? { createdAt: dateWhere(null, searchParams.get("from"), searchParams.get("to")) }
      : {}),
  };
  const { skip, take, page, pageSize } = parsePagination(searchParams);
  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return json({ data, meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) } });
}

async function handleReconciliation(method: string, request: Request, partyId?: string) {
  const prisma = getPrisma();

  if (method === "GET") {
    await requireApiSession("reports");
    const searchParams = getSearchParams(request);
    const where = {
      ...(partyId ? { partyId } : {}),
      ...(searchParams.get("partyId") ? { partyId: searchParams.get("partyId")! } : {}),
    };
    const data = await prisma.reconciliationGroup.findMany({
      where,
      include: { party: true, rows: true },
      orderBy: { date: "desc" },
    });
    return json({ data });
  }

  if (method === "POST") {
    const session = await requireApiSession("reports");
    const input = reconciliationSchema.parse(await readJson(request));
    const created = await prisma.reconciliationGroup.create({
      data: {
        partyId: input.partyId,
        name: input.name,
        date: new Date(input.date),
        rows: {
          create: input.rows.map((row) => {
            const rateQty = new Decimal(row.rateQty);
            return {
              description: row.description,
              rateQty,
              multiplier: row.multiplier,
              totalQty: rateQty.mul(row.multiplier),
            };
          }),
        },
      },
      include: { party: true, rows: true },
    });
    await prisma.auditLog.create({
      data: {
        tableName: "ReconciliationGroup",
        recordId: created.id,
        action: "CREATE",
        after: JSON.parse(JSON.stringify(created)),
        userId: session.user.id,
      },
    });
    return json(created, { status: 201 });
  }

  return errorJson("Method not allowed.", 405);
}

async function handleUsers(method: string, request: Request, id?: string) {
  const prisma = getPrisma();
  await requireApiSession("users");

  if (method === "GET") {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, isActive: true, mustChangePassword: true, createdAt: true },
      orderBy: { name: "asc" },
    });
    return json({ data: users });
  }

  if (method === "PATCH" && id) {
    const body = await readJson(request);
    const user = await prisma.user.update({
      where: { id },
      data: {
        name: body.name,
        role: body.role,
        isActive: body.isActive,
        mustChangePassword: body.mustChangePassword,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, mustChangePassword: true, createdAt: true },
    });
    return json(user);
  }

  return errorJson("Method not allowed.", 405);
}

export const dynamic = "force-dynamic";
