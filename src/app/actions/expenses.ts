"use server";



import { Prisma } from "@prisma/client";
import { serialize } from "@/lib/utils/serialize";
import { getDb } from "@/lib/prisma";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { writeAuditEvent } from "@/lib/domain";
import { emitFinancialEvent } from "@/lib/domain/financial-events";
import { projectDayBookExpense, recalculateDayBook, getOrCreateDayBook } from "@/lib/domain/daybook";
import { verifyEditPassword, requireActor } from "@/app/actions/auth";
import { validateWithSchema, ExpenseInputSchema, DeleteExpenseSchema } from "@/lib/validators/schemas";
import { sanitizeError } from "@/lib/utils/sanitize-error";

function normalizeVehicleNumber(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
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


export async function listExpenses() {
  const db = await getDb();
  return db.$transaction(async (tx) => {
    const rows = await tx.expense.findMany({
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    });
    if (!rows.length) return [];
    // expenseDate mixes local-midnight timestamps and UTC date-only values.
    // The assigned canonical Day Book is the date label's source of truth.
    const events = await tx.financialEvent.findMany({
      where: { entityType: "Expense", eventType: "EXPENSE_CREATED", entityId: { in: rows.map((row) => row.id) } },
      select: { eventId: true, entityId: true },
    });
    const projections = await tx.dayBookExpenseEntry.findMany({
      where: { sourceEventId: { in: events.map((event) => event.eventId) } },
      include: { dayBook: { select: { businessDate: true } } },
    });
    const targets = new Map<string, Set<string | null>>();
    const eventOwners = new Map(events.map((event) => [event.eventId, event.entityId]));
    for (const entry of projections) {
      const owner = eventOwners.get(entry.sourceEventId);
      if (!owner) continue;
      const iso = entry.dayBook.businessDate.toISOString();
      const label = iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : null;
      const labels = targets.get(owner) ?? new Set<string | null>();
      labels.add(label);
      targets.set(owner, labels);
    }
    return serialize(rows.map((row) => {
      const labels = targets.get(row.id);
      const businessDateLabel = labels?.size === 1 && !labels.has(null) ? [...labels][0] : null;
      return { ...row, businessDateLabel };
    }));
  });
}


export async function saveExpense(input: any, pin?: string, sessionToken?: string) {
  try {
    // Fail closed BEFORE any transactional work: once enrollment is complete a
    // valid session is mandatory, and the refusal returns as a normal failure
    // instead of an uncaught throw.
    const actor = await requireActor(sessionToken);
    const actorName = actor?.name ?? "system";
    const validated = validateWithSchema(ExpenseInputSchema, input);
    // An edit must be authorized on the server before any linked master or
    // financial write. A client-side check alone is not an access boundary.
    if (validated.id && (!pin || !(await verifyEditPassword(pin, "edit")))) {
      throw new Error("Invalid edit PIN");
    }
    const amount = validated.amount;
    
    return { success: true, data: serialize(await runTx(async (tx: Prisma.TransactionClient) => {
      let partyId = validated.partyId;
      let partyName = validated.partyName;
      if (partyName) {
        partyName = partyName.trim();
        let party = await tx.party.findFirst({ where: { partyName: { equals: partyName } } });
        if (!party) party = await tx.party.create({ data: { partyName } });
        partyId = party.id;
      }

      let vehicleId = validated.vehicleId;
      let vehicleNumber = validated.vehicleNumber;
      if (vehicleNumber) {
        vehicleNumber = normalizeVehicleNumber(vehicleNumber);
        let vehicle = await tx.vehicle.findFirst({ where: { vehicleNumber: { equals: vehicleNumber } } });
        if (!vehicle) vehicle = await tx.vehicle.create({ data: { vehicleNumber } });
        vehicleId = vehicle.id;
      }

      const data = {
        expenseDate: validated.expenseDate ? new Date(validated.expenseDate) : new Date(),
        expenseType: validated.expenseType,
        amount,
        paymentMode: validated.paymentMode || "CASH",
        partyId: partyId || null,
        partyName: partyName || null,
        vehicleId: vehicleId || null,
        vehicleNumber: vehicleNumber || null,
        description: validated.description ?? null,
      };

      // Preserve date-only strings as labels; Date inputs are local business timestamps.
      const dayBookDate = typeof validated.expenseDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(validated.expenseDate)
        ? validated.expenseDate : data.expenseDate;

      if (validated.id) {
        const before = await tx.expense.findUnique({ where: { id: validated.id } });
        // A fuel-mirrored expense follows its Fuel Purchase record. Editing only
        // the expense would split the two records and make the Day Book cash
        // composition unverifiable, so the canonical edit stays in Fuel Management.
        if (before) {
          const linkedFuel = await tx.fuelPurchase.findUnique({ where: { sourceEventId: before.sourceEventId } });
          if (linkedFuel) throw new Error("This expense is linked to a fuel purchase. Edit it from Fuel Management so both records stay consistent.");
          // EMPLOYEE_* types are written only by saveEmployeeLedgerEntry, which
          // mirrors the cash side of a worker ledger row into the Day Book. The
          // ledger row and the worker balance cannot change here, so editing the
          // mirror would silently split the records. There is no truthful
          // correction path yet, so this is a blocker, not a workaround.
          if (before.expenseType.startsWith("EMPLOYEE_")) throw new Error("This expense comes from an employee ledger entry. The app does not yet support correcting that cash entry, and editing it here would disconnect it from the worker's balance. Please ask the administrator to review the record.");
        }
        const row = await tx.expense.update({ where: { id: validated.id }, data });
        
        const financialEvent = await tx.financialEvent.findFirst({ where: { entityId: validated.id } });
        if (financialEvent) {
          const updatedEvent = await tx.financialEvent.update({
            where: { id: financialEvent.id },
            data: { payload: { ...data, expenseDate: data.expenseDate.toISOString() } }
          });
          
          // Keep the old projection target so a date move also refreshes its totals.
          const previousProjection = await tx.dayBookExpenseEntry.findUnique({
            where: { sourceEventId: updatedEvent.eventId },
          });
          const dayBook = await getOrCreateDayBook(tx, dayBookDate);
          const projected = projectDayBookExpense(updatedEvent, dayBook.id);
          await tx.dayBookExpenseEntry.upsert({
            where: { sourceEventId: projected.sourceEventId },
            update: projected,
            create: projected,
          });
          await recalculateDayBook(tx, dayBook);
          if (previousProjection && previousProjection.dayBookId !== dayBook.id) {
            const previousBook = await tx.dayBook.findUnique({ where: { id: previousProjection.dayBookId } });
            if (previousBook) await recalculateDayBook(tx, previousBook);
          }
        }
        
        await writeAuditEvent(tx, { entityName: "Expense", entityId: row.id, action: "update", role: actorName, before, after: row });
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

      const dayBook = await getOrCreateDayBook(tx, dayBookDate);
      const projected = projectDayBookExpense(financialEvent, dayBook.id);
      await tx.dayBookExpenseEntry.upsert({
        where: { sourceEventId: projected.sourceEventId },
        update: projected,
        create: projected,
      });
      await recalculateDayBook(tx, dayBook);

      await writeAuditEvent(tx, { entityName: "Expense", entityId: row.id, action: "create", role: actorName, before: null, after: row });
      return row;
    })) };
  } catch (error) {
    return { success: false, error: sanitizeError(error) };
  }
}


export async function deleteExpense(id: string, pin?: string, sessionToken?: string) {
  try {
    // Fail closed BEFORE any transactional work: once enrollment is complete a
    // valid session is mandatory, and the refusal returns as a normal failure
    // instead of an uncaught throw.
    const actor = await requireActor(sessionToken);
    const actorName = actor?.name ?? "system";
    validateWithSchema(DeleteExpenseSchema, { id, pin });
    if (!pin || !(await verifyEditPassword(pin, "delete"))) {
      throw new Error("Invalid delete PIN");
    }
    return { success: true, data: serialize(await runTx(async (tx: Prisma.TransactionClient) => {
      const row = await tx.expense.findUnique({ where: { id } });
      if (!row) throw new Error("Expense not found");
      // Same mirror rule as edit: removal belongs to the canonical fuel path,
      // which cascades to the expense and its Day Book projection itself.
      const linkedFuel = await tx.fuelPurchase.findUnique({ where: { sourceEventId: row.sourceEventId } });
      if (linkedFuel) throw new Error("This expense is linked to a fuel purchase. Delete it from Fuel Management so both records stay consistent.");
      // Same worker-mirror rule as edit: the ledger row and balance would keep
      // the old amount while the Day Book loses the cash movement.
      if (row.expenseType.startsWith("EMPLOYEE_")) throw new Error("This expense comes from an employee ledger entry. The app does not yet support correcting that cash entry, and deleting it here would disconnect it from the worker's balance. Please ask the administrator to review the record.");

      // Clean up financial event
      const financialEvent = await tx.financialEvent.findFirst({ where: { entityId: id } });
      const eventIdToDelete = financialEvent?.eventId;
      if (financialEvent) await tx.financialEvent.delete({ where: { id: financialEvent.id } });

      // Recalculate the books actually referenced by the projections. Inferring
      // a date from Expense.expenseDate can target another key for legacy data.
      const sourceIdsToDelete = [id, row.sourceEventId, eventIdToDelete].filter(Boolean) as string[];
      const projections = await tx.dayBookExpenseEntry.findMany({
        where: { sourceEventId: { in: sourceIdsToDelete } },
      });
      await tx.dayBookExpenseEntry.deleteMany({
        where: { sourceEventId: { in: sourceIdsToDelete } }
      });
      await tx.expense.delete({ where: { id } });
      const affectedBooks = await tx.dayBook.findMany({
        where: { id: { in: [...new Set(projections.map((entry) => entry.dayBookId))] } },
      });
      for (const dayBook of affectedBooks) await recalculateDayBook(tx, dayBook);

      try {
        await writeAuditEvent(tx, { entityName: "Expense", entityId: id, action: "delete", role: actorName, before: row, after: null });
      } catch {
        console.warn(`[Audit Log Warning] Failed to write audit event for Expense deletion (ID: ${id})`);
      }
      return row;
    })) };
  } catch (error) {
    return { success: false, error: sanitizeError(error) };
  }
}


