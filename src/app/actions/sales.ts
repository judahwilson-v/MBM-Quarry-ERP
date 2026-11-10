"use server";



import { Prisma } from "@prisma/client";
import { serialize } from "@/lib/utils/serialize";
import { getDb } from "@/lib/prisma";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { deriveSalesEngine, type SalesDraft } from "@/lib/sales-engine";
import { calculateRemainingCredit, decrementVehicleTrips, incrementVehicleTrips, writeAuditEvent } from "@/lib/domain";
import { emitFinancialEvent } from "@/lib/domain/financial-events";
import { getOrCreateDayBook, recalculateDayBook } from "@/lib/domain/daybook";
import { recalculatePartyLedger } from "@/lib/domain/ledger/party-ledger-service";
import { txAdjustInventoryStock } from "@/lib/domain/inventory/service";
import { verifyEditPassword, requireActor, isEnrollmentComplete } from "@/app/actions/auth";
import { validateWithSchema, SaleInputSchema, DeleteSaleSchema } from "@/lib/validators/schemas";
import { sanitizeError } from "@/lib/utils/sanitize-error";

export type SaleInput = SalesDraft & {
  id?: string;
  vehicleId?: string;
};

function normalizeVehicleNumber(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
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
    } catch {
      console.warn("Failed to write audit event for party upsert");
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
    } catch {
      console.warn("Failed to write audit event for vehicle create");
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
      } catch {
        console.warn("Failed to write audit event for vehicle update");
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

export async function checkDuplicateSaleBookNumber(bookNo: number, pageNo: number, excludeId?: string): Promise<boolean> {
  const db = await getDb();
  const existingSale = await db.outgoingSale.findFirst({
    where: {
      bookNumber: bookNo,
      pageNumber: pageNo,
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: { id: true }
  });
  
  const existingBoulder = await db.incomingBoulder.findFirst({
    where: {
      bookNumber: bookNo,
      pageNumber: pageNo,
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: { id: true }
  });
  
  return !!existingSale || !!existingBoulder;
}



export async function saveSale(input: SaleInput, pin?: string, sessionToken?: string) {
  try {
    // Fail closed BEFORE any transactional work: once enrollment is complete a
    // valid session is mandatory, and the refusal returns as a normal failure
    // instead of an uncaught throw.
    const actor = await requireActor(sessionToken);
    const actorName = actor?.name ?? "system";
    const validated = validateWithSchema(SaleInputSchema, input);
    const db = await getDb();
    const material = await db.material.findUnique({ where: { id: validated.materialId } });
    if (!material) throw new Error("Material is required.");
    // F08(a): an edit attempt is authorized BEFORE any committed master,
    // financial, or audit write (previously the PIN was checked inside the
    // transaction, after the party/vehicle upserts had already committed).
    if (validated.id) {
      if (!pin) {
        throw new Error("Admin PIN is required to edit records.");
      }
      const isAuth = await verifyEditPassword(pin);
      if (!isAuth) {
        throw new Error("Invalid Admin PIN");
      }
    }
    const normalizedVehicleNumber = normalizeVehicleNumber(validated.vehicleNumber);

    return { success: true, data: serialize(
      await runTx(async (tx) => {
        let partyId = null;
        if (validated.partyName) {
          const party = await upsertPartyByName(tx, validated.partyName);
          partyId = party?.id || null;
        }

        const parsedQty = validated.qty;
        const vehicle = await upsertVehicleByNumber(tx, normalizedVehicleNumber, validated.partyName ?? "", partyId, parsedQty);
        if (vehicle && !partyId) partyId = vehicle.partyId;

        const existing = validated.id ? await tx.outgoingSale.findUnique({ where: { id: validated.id } }) : null;
        const engine = deriveSalesEngine(
          { ...validated, partyId } as SalesDraft,
          { vehicle, material },
        );

        if (existing) {

          // FULL60: the FULL56 no-bypass rule now covers EVERY direct edit.
          // Once enrollment is complete, changing any field of an existing
          // sale requires the request-approval trail; the legacy edit action
          // and its shared PIN no longer authorize edits at all. Unenrolled
          // installs keep the previous PIN-gated behavior.
          if (await isEnrollmentComplete()) {
            throw new Error("Sale edits require an approved change request. File a request from the sales list instead.");
          }
          if (existing.vehicleId) {
            await decrementVehicleTrips(tx, existing.vehicleId, existing.tripDelta ?? 1);
          }
          const sale = await tx.outgoingSale.update({
            where: { id: existing.id },
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
            role: actorName,
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

        const bookNum = validated.bookNumber;
        const pageNum = validated.pageNumber;
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
          role: actorName,
          after: sale,
          reason: engine.qtyChanged ? engine.quantityReason : null,
        });

        // Deduct inventory
        await txAdjustInventoryStock(tx, sale.materialName, -sale.qty, 'SALE_OUT', sale.id, `Sale: ${sale.vehicleNumber}`);

        return sale;
      }),
    ) };
  } catch (error) {
    return { success: false, error: sanitizeError(error) };
  }
}


export async function deleteSale(id: string, pin?: string, sessionToken?: string) {
  try {
    // Fail closed BEFORE any transactional work: once enrollment is complete a
    // valid session is mandatory, and the refusal returns as a normal failure
    // instead of an uncaught throw.
    const actor = await requireActor(sessionToken);
    const actorName = actor?.name ?? "system";
    validateWithSchema(DeleteSaleSchema, { id, pin });
    // FULL60: once enrollment is complete, deletes require the request-approval
    // trail; the shared legacy delete PIN no longer authorizes deletion.
    // Checked BEFORE the PIN so a post-enrollment refusal never reveals PIN
    // validity. Unenrolled installs keep the previous PIN-gated behavior.
    if (await isEnrollmentComplete()) {
      throw new Error("Deleting a sale requires an approved change request. File a delete request from the sales list instead.");
    }
    if (!pin || !(await verifyEditPassword(pin, "delete"))) {
      throw new Error("Invalid delete PIN");
    }
    await runTx(async (tx) => {
      const existing = await tx.outgoingSale.findUnique({ where: { id } });
      if (existing) {
        await tx.outgoingSale.delete({ where: { id } });
        
        if (existing.vehicleId) {
          const v = await tx.vehicle.findUnique({ where: { id: existing.vehicleId } });
          if (v) await decrementVehicleTrips(tx, existing.vehicleId, existing.tripDelta ?? 1);
        }
        
        // FULL60: the deletion trail is fail-closed like every other approved
        // mutation - if the audit event cannot be written the transaction
        // rolls back and nothing is deleted. A delete must never commit
        // without its trail.
        await writeAuditEvent(tx, {
          entityName: "Sale",
          entityId: id,
          action: "delete",
          role: actorName,
          before: existing,
        });

        if (existing.partyId) {
          const p = await tx.party.findUnique({ where: { id: existing.partyId } });
          if (p) await recalculatePartyLedger(tx, existing.partyId);
        }

        // Restore inventory
        const m = await tx.material.findFirst({ where: { materialName: existing.materialName } });
        if (m) {
          await txAdjustInventoryStock(tx, existing.materialName, existing.qty, 'SALE_OUT', id, `Sale Deleted: ${existing.vehicleNumber}`);
        }
        
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
    return { success: true };
  } catch (error) {
    return { success: false, error: sanitizeError(error) };
  }
}


// FULL74: the bulk non-GST purge is RETIRED. Deleting many sales in one
// action destroys the record trail the owner requires (10 Nov: additions,
// edits and removals stay recorded and accountable). No PIN or session
// re-enables it. FULL75 wording honesty: corrections go one at a time
// through the request-approval trail; removing a sale record is NOT
// implemented yet, and this message must not imply it is. This function
// never deletes anything.
export async function purgeNonGstSales(_pin?: string, _sessionToken?: string) {
  return { success: false as const, error: "Bulk purge of sales has been retired. Sales are corrected one record at a time through the request-approval trail, so every change stays recorded. Removing a sale record is not supported yet, so the record stays in the books." };
}


