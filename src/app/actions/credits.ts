"use server";



import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/prisma";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { writeAuditEvent } from "@/lib/domain";
import { emitFinancialEvent } from "@/lib/domain/financial-events";
import { recalculatePartyLedger } from "@/lib/domain/ledger/party-ledger-service";
import { verifyEditPassword } from "@/app/actions/auth";
import {
  validateWithSchema,
  PartyCollectionInputSchema,
  PartyPaymentInputSchema,
  DeletePartyCollectionSchema,
  DeletePartyPaymentSchema,
  OtherCreditInputSchema,
  DeleteOtherCreditSchema,
} from "@/lib/validators/schemas";
import { sanitizeError } from "@/lib/utils/sanitize-error";

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

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

function containsSearch(row: Record<string, unknown>, search?: string) {
  const query = search?.trim().toLowerCase();
  if (!query) return true;
  return Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query));
}



async function runTx<T>(txFn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
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
  try {
    const validated = validateWithSchema(PartyCollectionInputSchema, input);
    const partyName = validated.partyName.trim();
    const cashPaid = validated.cashPaid ?? 0;
    const bankPaid = validated.bankPaid ?? 0;
    const gPayPaid = validated.gPayPaid ?? 0;
    const totalAmount = roundMoney(cashPaid + bankPaid + gPayPaid);
    if (totalAmount <= 0) throw new Error("Collection amount must be greater than 0.");
    const collectionDate = validated.collectionDate ? new Date(validated.collectionDate) : new Date();

    return serialize(
      await runTx(async (tx: Prisma.TransactionClient) => {
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
            remarks: validated.remarks ?? null,
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
            remarks: validated.remarks ?? null,
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
  } catch (error) {
    throw new Error(sanitizeError(error));
  }
}

async function getPartyOutstandingBalance(tx: Prisma.TransactionClient, partyId: string) {
  const ledger = await tx.partyLedger.findFirst({
    where: { partyId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }]
  });
  return ledger ? ledger.balance : 0;
}


export async function savePartyPayment(input: any) {
  try {
    const validated = validateWithSchema(PartyPaymentInputSchema, input);
    const partyName = validated.partyName.trim();
    const cashPaid = validated.cashPaid ?? 0;
    const bankPaid = validated.bankPaid ?? 0;
    const gPayPaid = validated.gPayPaid ?? 0;
    const totalAmount = roundMoney(cashPaid + bankPaid + gPayPaid);
    if (totalAmount <= 0) throw new Error("Payment amount must be greater than 0.");
    const paymentDate = validated.paymentDate ? new Date(validated.paymentDate) : new Date();

    return serialize(
      await runTx(async (tx: Prisma.TransactionClient) => {
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
            remarks: validated.remarks ?? null,
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
            remarks: validated.remarks ?? null,
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
  } catch (error) {
    throw new Error(sanitizeError(error));
  }
}


export async function deletePartyCollection(id: string, pin?: string) {
  try {
    validateWithSchema(DeletePartyCollectionSchema, { id, pin });
    if (!pin) {
      throw new Error("Admin/Delete PIN is required to delete records.");
    }
    const isAuth = await verifyEditPassword(pin, "delete");
    if (!isAuth) {
      throw new Error("Invalid PIN");
    }

    await runTx(async (tx: Prisma.TransactionClient) => {
      const collection = await tx.partyCollection.findUnique({ where: { id } });
      if (!collection) return;
      await tx.partyCollection.delete({ where: { id } });
      
      // Cascade delete events
      await tx.financialEvent.deleteMany({ where: { entityId: id } });
      
      if (collection.partyId) await recalculatePartyLedger(tx, collection.partyId);
    });
  } catch (error) {
    throw new Error(sanitizeError(error));
  }
}


export async function deletePartyPayment(id: string, pin?: string) {
  try {
    validateWithSchema(DeletePartyPaymentSchema, { id, pin });
    if (!pin) {
      throw new Error("Admin/Delete PIN is required to delete records.");
    }
    const isAuth = await verifyEditPassword(pin, "delete");
    if (!isAuth) {
      throw new Error("Invalid PIN");
    }

    await runTx(async (tx: Prisma.TransactionClient) => {
      const payment = await tx.partyPayment.findUnique({ where: { id } });
      if (!payment) return;
      await tx.partyPayment.delete({ where: { id } });
      
      // Cascade delete events
      await tx.financialEvent.deleteMany({ where: { entityId: id } });
      
      if (payment.partyId) await recalculatePartyLedger(tx, payment.partyId);
    });
  } catch (error) {
    throw new Error(sanitizeError(error));
  }
}


export async function listPartiesWithBalances() {
  const db = await getDb();
  
  // Efficiently fetch the latest ledger balance for all parties in a single query
  // using SQLite window function ROW_NUMBER()
  const rawLedgers: any[] = await db.$queryRaw`
    SELECT party_id, balance
    FROM (
      SELECT party_id, balance,
             ROW_NUMBER() OVER (PARTITION BY party_id ORDER BY date DESC, created_at DESC) as rn
      FROM party_ledger
      WHERE party_id IS NOT NULL
    )
    WHERE rn = 1 AND balance != 0
  `;
  
  const balanceMap = new Map<string, number>();
  for (const row of rawLedgers) {
    balanceMap.set(row.party_id, row.balance);
  }

  const parties = await db.party.findMany({ 
    where: { id: { in: Array.from(balanceMap.keys()) } },
    orderBy: { partyName: 'asc' } 
  });
  
  const result = parties.map(p => ({
    id: p.id,
    partyName: p.partyName,
    balance: balanceMap.get(p.id) || 0,
  }));
  
  return result;
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
  try {
    const validated = validateWithSchema(OtherCreditInputSchema, input);
    const data = {
      name: validated.name,
      amount: validated.amount,
      reason: validated.reason ?? null,
      expectedDueDate: validated.expectedDueDate ? new Date(validated.expectedDueDate) : null,
      status: (validated.status || "pending").toLowerCase(),
    };
    if (data.amount <= 0) throw new Error("Amount must be greater than 0.");
    if (validated.id) {
      return serialize(await runTx(async (tx: Prisma.TransactionClient) => {
        const before = await tx.otherCredit.findUnique({ where: { id: validated.id! } });
        const row = await tx.otherCredit.update({ where: { id: validated.id! }, data });
        await writeAuditEvent(tx, { entityName: "OtherCredit", entityId: row.id, action: "update", role: "system", before, after: row });
        return row;
      }));
    }
    return serialize(await runTx(async (tx: Prisma.TransactionClient) => {
      const row = await tx.otherCredit.create({ data });
      await writeAuditEvent(tx, { entityName: "OtherCredit", entityId: row.id, action: "create", role: "system", after: row });
      return row;
    }));
  } catch (error) {
    throw new Error(sanitizeError(error));
  }
}


export async function deleteOtherCredit(id: string) {
  try {
    validateWithSchema(DeleteOtherCreditSchema, { id });
    await runTx(async (tx: Prisma.TransactionClient) => {
      const before = await tx.otherCredit.findUnique({ where: { id } });
      await tx.otherCredit.delete({ where: { id } });
      if (before) await writeAuditEvent(tx, { entityName: "OtherCredit", entityId: id, action: "delete", role: "system", before });
    });
  } catch (error) {
    throw new Error(sanitizeError(error));
  }
}



