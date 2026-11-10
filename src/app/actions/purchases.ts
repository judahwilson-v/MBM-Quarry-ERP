"use server";



import { Prisma } from "@prisma/client";
import { serialize } from "@/lib/utils/serialize";
import { getDb } from "@/lib/prisma";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { writeAuditEvent } from "@/lib/domain";
import { addDayBookExpense, recalculateDayBook, getOrCreateDayBook } from "@/lib/domain/daybook";
import { recalculatePartyLedger } from "@/lib/domain/ledger/party-ledger-service";
import { txAdjustInventoryStock } from "@/lib/domain/inventory/service";
import { verifyEditPassword, requireActor } from "@/app/actions/auth";
import { validateWithSchema, IncomingBoulderInputSchema, DeleteIncomingBoulderSchema } from "@/lib/validators/schemas";
import { sanitizeError } from "@/lib/utils/sanitize-error";

export type IncomingBoulderInput = {
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

function normalizeVehicleNumber(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function cleanText(value?: string | null) {
  const text = value?.trim() ?? "";
  return text || null;
}

function parseDateInput(value?: string | Date | null) {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const text = value.trim();
  // Exactly two accepted input shapes, no input expansion over baseline:
  // - A date-only label ("2026-11-10") is a business date chosen by the user:
  //   canonical local-midnight write, unchanged.
  // - A timezone-qualified serialized datetime ("2026-11-09T18:30:00.000Z",
  //   offset forms included) is an exact instant - typically a stored Date
  //   resent by an inline editor that did not change the date - preserved
  //   as-is on any host, never reduced to a host-local day.
  // Timezone-less datetimes, partial strings and bare numbers keep the
  // baseline rejection: no new date policy.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T00:00:00`);
    if (Number.isNaN(date.getTime())) throw new Error("Date is invalid.");
    return date;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    const instant = new Date(text);
    if (Number.isNaN(instant.getTime())) throw new Error("Date is invalid.");
    return instant;
  }
  throw new Error("Date is invalid.");
}
function containsSearch(row: Record<string, unknown>, search?: string) {
  const query = search?.trim().toLowerCase();
  if (!query) return true;
  return Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query));
}

// F08(a): master upserts run inside the caller's business transaction so a
// failed sale/purchase never leaves a committed orphan Party/Vehicle row.
async function upsertPartyByName(tx: Prisma.TransactionClient, partyName: string) {
  const name = partyName.trim();
  if (!name) return;
  const existing = await tx.party.findFirst({
    where: { partyName: { equals: name } },
    select: { id: true },
  });
  if (!existing) {
    const row = await tx.party.create({ data: { partyName: name } });
    try {
      await writeAuditEvent(tx, { entityName: "Party", entityId: row.id, action: "create", role: "system", after: row });
    } catch (e) {
      console.warn("Failed to write audit event for party upsert:", e);
    }
    return row;
  }
  return existing;
}

async function upsertVehicleByNumber(tx: Prisma.TransactionClient, vehicleNumber: string, partyName?: string, partyId?: string | null, qty?: number | null) {
  const normalized = normalizeVehicleNumber(vehicleNumber);
  if (!normalized) return null;

  let existing = await tx.vehicle.findUnique({
    where: { vehicleNumber: normalized },
  });

  if (!existing) {
    existing = await tx.vehicle.create({
      data: {
        vehicleNumber: normalized,
        partyName: partyName || null,
        partyId: partyId || null,
        companyBodyQty: qty || null,
      },
    });
    try {
      await writeAuditEvent(tx, { entityName: "Vehicle", entityId: existing.id, action: "create", role: "system", after: existing });
    } catch (e) {
      console.warn("Failed to write audit event for vehicle create:", e);
    }
  } else {
    const updateData: any = {};
    if (partyName && !existing.partyName) updateData.partyName = partyName;
    if (partyId && !existing.partyId) updateData.partyId = partyId;
    if (qty && !existing.companyBodyQty && !existing.extraBodyQty) updateData.companyBodyQty = qty;

    if (Object.keys(updateData).length > 0) {
      const before = existing;
      existing = await tx.vehicle.update({
        where: { id: existing.id },
        data: updateData,
      });
      try {
        await writeAuditEvent(tx, { entityName: "Vehicle", entityId: existing.id, action: "update", role: "system", before, after: existing });
      } catch (e) {
        console.warn("Failed to write audit event for vehicle update:", e);
      }
    }
  }

  return existing;
}

async function runTx<T>(txFn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const db = await getDb();
  try {
    return await db.$transaction(txFn);
  } finally {
    // Fire-and-forget: don't block the server action response with sync
    setTimeout(() => triggerAutoSync().catch(console.error), 0);
  }
}


export async function listIncomingBoulder(search = "") {
  const db = await getDb();
  const rows = await db.incomingBoulder.findMany({ orderBy: [{ createdAt: "desc" }] });
  return serialize(rows.filter((row) => containsSearch(row, search)));
}


export async function saveIncomingBoulder(input: IncomingBoulderInput, pin?: string, sessionToken?: string) {
  try {
    // Fail closed BEFORE any transactional work: once enrollment is complete a
    // valid session is mandatory, and the refusal returns as a normal failure
    // instead of an uncaught throw.
    const actor = await requireActor(sessionToken);
    const actorName = actor?.name ?? "system";
    const validated = validateWithSchema(IncomingBoulderInputSchema, input);
    const qty = validated.qty;
    const rockRate = validated.rockRate ?? 26;
    const amount = qty * rockRate;
    const cashPaid = validated.cashPaid ?? 0;
    const bankPaid = validated.bankPaid ?? 0;
    const gPayPaid = validated.gPayPaid ?? 0;
    const vehicleRent = validated.vehicleRent ?? 0;
    const paidTotal = cashPaid + bankPaid + gPayPaid;
    const remainingCredit = amount - paidTotal;

    const bookNum = validated.bookNumber;
    const pageNum = validated.pageNumber;

    const data = {
      date: parseDateInput(validated.date),
      time: validated.time || null,
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
      combinedPayment: validated.combinedPayment || false,
      remarks: cleanText(validated.remarks),
    };
    const normalizedVehicle = normalizeVehicleNumber(cleanText(validated.vehicleNumber) ?? "");
    const partyName = cleanText(validated.partyName) ?? "";
    
    // F08(a): an edit attempt is authorized BEFORE any committed master,
    // financial, or audit write (previously the party/vehicle upserts ran
    // and committed before this PIN check).
    if (validated.id) {
      if (!pin) {
        throw new Error("Admin PIN is required to edit records.");
      }
      const isAuth = await verifyEditPassword(pin);
      if (!isAuth) {
        throw new Error("Invalid Admin PIN");
      }
    }

    data.vehicleNumber = normalizedVehicle;
    data.partyName = partyName;

    return serialize(await runTx(async (tx) => {
      // F08(a): master upserts inside the business transaction, so a failed
      // purchase never leaves a committed orphan Party/Vehicle row.
      let partyId = null;
      if (partyName) {
        const party = await upsertPartyByName(tx, partyName);
        partyId = party?.id || null;
      }
      const vehicle = await upsertVehicleByNumber(tx, normalizedVehicle, partyName, partyId, qty);
      const finalData = { ...data, partyId, vehicleId: vehicle?.id || null };

      if (validated.id) {
        const before = await tx.incomingBoulder.findUnique({ where: { id: validated.id! } });
        const row = await tx.incomingBoulder.update({ where: { id: validated.id! }, data: finalData });
        await writeAuditEvent(tx, { entityName: "IncomingBoulder", entityId: row.id, action: "update", role: actorName, before, after: row });
        
        if (row.partyId) await recalculatePartyLedger(tx, row.partyId);

        // Handle Expense for immediate payment
        if (data.paidTotal > 0) {
          await addDayBookExpense(tx, {
            businessDate: data.date.toISOString(),
            expenseType: "MISCELLANEOUS",
            sourceKind: "BOULDER_IMMEDIATE",
            sourceEntityId: row.id,
            paymentBreakdown: { cashPaid: data.cashPaid, bankPaid: data.bankPaid, gPayPaid: data.gPayPaid },
            amount: data.paidTotal,
            description: `Paid for Boulder Purchase (${row.vehicleNumber}) - ${data.partyName}`
          });
        }

        // Sync inventory
        const qtyDiff = row.qty - (before?.qty ?? 0);
        if (qtyDiff !== 0) {
          await txAdjustInventoryStock(tx, "ROCK", qtyDiff, 'PRODUCTION_IN', row.id, `Boulder Purchase Updated: ${row.vehicleNumber}`);
        }

        return row;
      }
      const row = await tx.incomingBoulder.create({ data: finalData });
      await writeAuditEvent(tx, { entityName: "IncomingBoulder", entityId: row.id, action: "create", role: actorName, after: row });
      
      if (row.partyId) await recalculatePartyLedger(tx, row.partyId);

      // Handle Expense for immediate payment
      if (data.paidTotal > 0) {
        await addDayBookExpense(tx, {
          businessDate: data.date.toISOString(),
          expenseType: "MISCELLANEOUS",
            sourceKind: "BOULDER_IMMEDIATE",
            sourceEntityId: row.id,
            paymentBreakdown: { cashPaid: data.cashPaid, bankPaid: data.bankPaid, gPayPaid: data.gPayPaid },
          amount: data.paidTotal,
          description: `Paid for Boulder Purchase (${row.vehicleNumber}) - ${data.partyName}`
        });
      }

      // Add inventory
      await txAdjustInventoryStock(tx, "ROCK", row.qty, 'PRODUCTION_IN', row.id, `Boulder Purchase: ${row.vehicleNumber}`);

      return row;
    }));
  } catch (error) {
    return { success: false, error: sanitizeError(error) };
  }
}


export async function deleteIncomingBoulder(id: string, pin?: string, sessionToken?: string) {
  try {
    // Fail closed BEFORE any transactional work: once enrollment is complete a
    // valid session is mandatory, and the refusal returns as a normal failure
    // instead of an uncaught throw.
    const actor = await requireActor(sessionToken);
    const actorName = actor?.name ?? "system";
    validateWithSchema(DeleteIncomingBoulderSchema, { id, pin });
    if (!pin) {
      throw new Error("Admin/Delete PIN is required to delete records.");
    }
    const isAuth = await verifyEditPassword(pin, "delete");
    if (!isAuth) {
      throw new Error("Invalid PIN");
    }

    await runTx(async (tx) => {
      const before = await tx.incomingBoulder.findUnique({ where: { id } });
      if (before) {
        await tx.incomingBoulder.delete({ where: { id } });
        
        try {
          await writeAuditEvent(tx, { entityName: "IncomingBoulder", entityId: id, action: "delete", role: actorName, before });
        } catch {
          console.warn(`[Audit Log Warning] Failed to write audit event for IncomingBoulder deletion (ID: ${id})`);
        }

        if (before.partyId) {
          const p = await tx.party.findUnique({ where: { id: before.partyId } });
          if (p) await recalculatePartyLedger(tx, before.partyId);
        }

        // Revert inventory
        await txAdjustInventoryStock(tx, "ROCK", -before.qty, 'PRODUCTION_IN', id, `Boulder Purchase Deleted: ${before.vehicleNumber}`);
        
        // Cascade delete associated daybook expense
        const expenseDesc = `Paid for Boulder Purchase (${before.vehicleNumber}) - ${before.partyName}`;
        const expenses = await tx.dayBookExpenseEntry.findMany({ where: { description: expenseDesc } });
        if (expenses.length > 0) {
          await tx.dayBookExpenseEntry.deleteMany({ where: { description: expenseDesc } });
          const sourceEventIds = expenses.map((e: any) => e.sourceEventId);
          await tx.financialEvent.deleteMany({ where: { eventId: { in: sourceEventIds } } });
        }

        const dayBook = await getOrCreateDayBook(tx, before.date.toISOString());
        await recalculateDayBook(tx, dayBook);
      }
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: sanitizeError(error) };
  }
}


