// Server-internal decision core, NOT a Server Action. Callers must verify authority.
// Shared by the existing local control gate and the mapped website inbox.
import { getDb } from "@/lib/prisma";
import { requireActor, isEnrollmentComplete, type Actor } from "@/app/actions/auth";
import { requireControlActor } from "@/lib/identity/control";
import { writeAuditEvent, calculateRemainingCredit, decrementVehicleTrips, incrementVehicleTrips } from "@/lib/domain";
import { recalculatePartyLedger } from "@/lib/domain/ledger/party-ledger-service";
import { txAdjustInventoryStock } from "@/lib/domain/inventory/service";
import { deriveSalesEngine, type SalesDraft } from "@/lib/sales-engine";
import { emitFinancialEvent } from "@/lib/domain/financial-events";
import { isIdentitySetupCompatibilityMode } from "@/lib/identity/service";
import { fingerprintOutgoingSale, normalizeRemarks, OUTGOING_SALE_BUSINESS_FIELDS, OUTGOING_SALE_EDITABLE_FIELDS, snapshotSaleFields } from "@/lib/domain/change-requests/fingerprint";
import { sanitizeError } from "@/lib/utils/sanitize-error";

export type ChangeRequestView = {
  id: string;
  entityName: string;
  entityId: string;
  operation: string;
  originalValue: string | null;
  proposedValue: string | null;
  reason: string;
  status: string;
  requestedByName: string;
  decidedByName: string | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  appliedAt: string | null;
  // Server-resolved ownership: true when the validated session actor filed
  // this request (or in setup compatibility mode, where cancellation is open
  // by design). The UI must use this, never a local display-name comparison.
  mine: boolean;
};

function toView(row: any, viewerId?: string | null, setupMode?: boolean): ChangeRequestView {
  return {
    id: row.id,
    entityName: row.entityName,
    entityId: row.entityId,
    operation: row.operation,
    originalValue: row.originalValue ?? null,
    proposedValue: row.proposedValue ?? null,
    reason: row.reason,
    status: row.status,
    requestedByName: row.requestedByName,
    decidedByName: row.decidedByName ?? null,
    decisionNote: row.decisionNote ?? null,
    createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
    mine: setupMode ? true : !!viewerId && !!row.requestedById && viewerId === row.requestedById,
  };
}

// FULL73: apply an approved monetary sale correction. Direction set by the
// owner's delegated judgment (10 Nov): an approved edit corrects the ORIGINAL
// sale on its ORIGINAL day; old values, requester and approver stay visible;
// no payment or refund is invented.
//
// v1 supported fields: qty, ratePerCft, discountType, discountValue,
// gstEnabled. Derived totals are recomputed through the SAME sales engine
// used at creation. Anything else in a proposal (party, vehicle, material,
// date, book/page, paid splits) is truthfully refused and stays pending.
// Actual paid amounts never change here: money moves only through real
// collections. A correction that would make the sale overpaid (corrected
// total below what the customer already paid) is refused, because the books
// cannot show customer credit owed back yet (T06, owner decision pending) -
// refusing hides nothing and fabricates nothing.
const APPLY_SUPPORTED_FIELDS = ["qty", "ratePerCft", "discountType", "discountValue", "gstEnabled"] as const;

async function applySaleFieldEdit(
  tx: any,
  req: any,
  decidedById: string | null,
  decidedByName: string,
  note: string | null,
) {
  const sale = await tx.outgoingSale.findUnique({ where: { id: req.entityId } });
  if (sale && req.recordFingerprint == null) {
    throw new Error("This request predates record-context tracking and cannot be approved. Cancel it and file a new request.");
  }
  const fingerprintMatches = !!sale && fingerprintOutgoingSale(sale as unknown as Record<string, unknown>) === req.recordFingerprint;
  if (!sale || !fingerprintMatches) {
    const conflict = await tx.changeRequest.update({
      where: { id: req.id },
      data: {
        status: "CONFLICT",
        decidedById,
        decidedByName,
        decisionNote: note ?? "The record changed after this request was filed; nothing was applied.",
        decidedAt: new Date(),
      },
    });
    await writeAuditEvent(tx, {
      entityName: "ChangeRequest",
      entityId: req.id,
      action: "update",
      role: decidedByName,
      before: { status: "PENDING" },
      after: { status: "CONFLICT", recordMissing: !sale, recordDrifted: !!sale && !fingerprintMatches },
      reason: "Stale record at approval time; no change applied.",
    });
    return { success: false as const, conflict: true as const, message: "The record changed after this request was filed. Nothing was applied.", request: toView(conflict) };
  }

  const proposedMap = JSON.parse(req.proposedValue ?? "{}") as Record<string, unknown>;
  const unsupported = Object.keys(proposedMap).filter((f) => !(APPLY_SUPPORTED_FIELDS as readonly string[]).includes(f));
  if (unsupported.length) {
    throw new Error(`Approving changes to ${unsupported.join(", ")} is not supported yet. The request stays pending and the record is unchanged.`);
  }

  const material = sale.materialId ? await tx.material.findUnique({ where: { id: sale.materialId } }) : null;
  if (!material) throw new Error("The sale's material record is missing, so the correction cannot be computed safely. Nothing was applied.");
  const vehicle = sale.vehicleId ? await tx.vehicle.findUnique({ where: { id: sale.vehicleId } }) : null;

  const pick = (field: string, current: unknown) => (field in proposedMap ? proposedMap[field] : current);
  const draft: SalesDraft = {
    saleDate: sale.saleDate.toISOString().slice(0, 10),
    vehicleNumber: sale.vehicleNumber,
    partyName: sale.partyName,
    partyId: sale.partyId,
    materialId: sale.materialId ?? "",
    qty: pick("qty", sale.qty) as string | number,
    ratePerCft: pick("ratePerCft", sale.ratePerCft) as string | number,
    discountType: pick("discountType", sale.discountType) as SalesDraft["discountType"],
    discountValue: pick("discountValue", sale.discountValue) as string | number,
    gstEnabled: pick("gstEnabled", sale.gstEnabled) as boolean,
    cashPaid: sale.cashPaid,
    bankPaid: sale.bankPaid,
    gPayPaid: sale.gPayPaid,
    // Validation-only documentation: the engine requires remarks when the
    // rate or discount departs from defaults and a reason when the quantity
    // departs from vehicle defaults. The correction reason documents both;
    // the sale's own remarks field is NOT overwritten.
    remarks: sale.remarks ?? req.reason,
    quantityReason: "qty" in proposedMap ? req.reason : sale.quantityReason,
  };
  const engine = deriveSalesEngine(draft, { vehicle, material });

  // A correction below what the customer already paid is refused by the
  // engine itself ("Payment cannot exceed final amount." - sales-engine.ts).
  // The request stays PENDING and the record is unchanged; showing money owed
  // back to a customer is not supported yet.
  //
  // FULL73R: collections are party-level REAL money the customer handed over.
  // A correction that would push the party's net balance below zero leaves
  // them having paid more than they owe - customer credit, which the books
  // cannot record yet (T06 owner decision, open). Refuse ONLY when this
  // correction creates or increases a negative balance (projected < 0 and
  // worse than now); a pre-existing negative balance that the correction
  // improves is not blocked, unrelated party credit is untouched, and no
  // refund or cash movement is invented. Conservative boundary, not a final
  // refund policy. Nothing is written on refusal: the request stays PENDING.
  const newCredit = engine.finalAmount - sale.paidTotal;
  if (sale.partyId) {
    const lastLedger = await tx.partyLedger.findFirst({
      where: { partyId: sale.partyId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    const currentBalance = lastLedger?.balance ?? 0;
    const projected = currentBalance - Math.max(0, sale.remainingCredit) + Math.max(0, newCredit);
    if (projected < 0 && projected < currentBalance) {
      throw new Error(`This correction would leave ${sale.partyName} having paid more than they owe (customer credit of ${-projected}). The books cannot record money owed back to a customer yet, so the request stays pending and the record is unchanged.`);
    }
  }
  const updated = await tx.outgoingSale.update({
    where: { id: sale.id },
    data: {
      ratePerCft: engine.ratePerCft,
      qty: engine.qty,
      originalQty: engine.originalQty,
      quantityReason: engine.qtyChanged ? engine.quantityReason : sale.quantityReason,
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
      remainingCredit: calculateRemainingCredit(engine.finalAmount, sale.paidTotal),
    },
  });
  if (sale.vehicleId && (sale.tripDelta ?? 1) !== engine.tripDelta) {
    await decrementVehicleTrips(tx, sale.vehicleId, sale.tripDelta ?? 1);
    await incrementVehicleTrips(tx, sale.vehicleId, engine.tripDelta);
  }
  const qtyDiff = sale.qty - updated.qty;
  if (qtyDiff !== 0) {
    await txAdjustInventoryStock(tx, updated.materialName, qtyDiff, "SALE_OUT", sale.id, `Sale correction (approved change request ${req.id})`, "CFT");
  }
  if (updated.partyId) await recalculatePartyLedger(tx, updated.partyId);

  // Correction event: appended, never rewritten. The projection supersedes
  // the original sale's projection; the Day Book for the ORIGINAL day
  // recalculates. Paid splits are carried unchanged. FULL73R: the payload
  // names the event it supersedes, so replay/rebuild/sync order can never
  // resurrect the old revision (no clock or insertion-order assumption).
  // FULL73R2: the revision this correction supersedes is the chain HEAD -
  // the one stored event for this sale that no other event supersedes - never
  // the clock-newest row. Clocks and UUIDs can lie (replay, sync, a wrong
  // device clock); the supersession marker is the causal record. If the
  // stored history is ambiguous (a fork: zero or more than one unsuperseded
  // event), there is no honest current revision: refuse truthfully, the
  // transaction rolls back, the request stays PENDING, nothing is written.
  const chainEvents: Array<{ eventId: string; payload: unknown }> = await tx.financialEvent.findMany({
    where: { entityId: sale.id, eventType: "SALE_CREATED" },
    select: { eventId: true, payload: true },
  });
  let supersedesEventId: string | null = null;
  if (chainEvents.length > 0) {
    const supersededIds = new Set<string>(
      chainEvents
        .map((e: { eventId: string; payload: unknown }) => (e.payload as Record<string, unknown> | null)?.supersedesEventId)
        .filter((x: unknown): x is string => typeof x === "string"),
    );
    const heads = chainEvents.filter((e: { eventId: string; payload: unknown }) => !supersededIds.has(e.eventId));
    if (heads.length !== 1) {
      throw new Error(`This sale's correction history is ambiguous (${heads.length} unsuperseded versions found, exactly one expected). The request stays pending and the record is unchanged.`);
    }
    supersedesEventId = heads[0].eventId;
  }
  await emitFinancialEvent(tx, {
    correlationId: sale.id,
    eventType: "SALE_CREATED",
    entityType: "Sale",
    entityId: sale.id,
    payload: {
      supersedesEventId,
      saleId: sale.id,
      bookNumber: updated.bookNumber,
      pageNumber: updated.pageNumber,
      saleDate: updated.saleDate.toISOString(),
      vehicleId: updated.vehicleId,
      partyId: updated.partyId,
      materialId: updated.materialId,
      vehicleNumber: updated.vehicleNumber,
      partyName: updated.partyName,
      materialName: updated.materialName,
      qty: updated.qty,
      originalQty: updated.originalQty ?? updated.qty,
      quantityReason: updated.quantityReason,
      ratePerCft: updated.ratePerCft,
      amount: updated.amount,
      discountType: updated.discountType as "percentage" | "fixed",
      discountValue: updated.discountValue,
      gstEnabled: updated.gstEnabled,
      gstRate: updated.gstRate,
      sgst: updated.sgst,
      cgst: updated.cgst,
      gstAmount: updated.gstAmount,
      finalAmount: updated.finalAmount,
      cashPaid: updated.cashPaid,
      bankPaid: updated.bankPaid,
      gPayPaid: updated.gPayPaid,
      paidTotal: updated.paidTotal,
      remainingCredit: updated.remainingCredit,
      tripDelta: updated.tripDelta,
      remarks: updated.remarks,
    },
  });

  const audit = await writeAuditEvent(tx, {
    entityName: "Sale",
    entityId: sale.id,
    action: "update",
    role: decidedByName,
    before: JSON.parse(req.originalValue ?? "{}"),
    after: { proposed: proposedMap, derived: { amount: updated.amount, finalAmount: updated.finalAmount, remainingCredit: updated.remainingCredit } },
    reason: `Approved change request ${req.id} filed by ${req.requestedByName}: ${req.reason}`,
  });
  const claimApplied = await tx.changeRequest.updateMany({
    where: { id: req.id, status: "PENDING" },
    data: {
      status: "APPLIED",
      decidedById,
      decidedByName,
      decisionNote: note,
      decidedAt: new Date(),
      appliedAt: new Date(),
      appliedAuditId: (audit as any)?.id ?? null,
    },
  });
  if (claimApplied.count !== 1) {
    const race = new Error("Concurrent decision detected.");
    (race as any).code = "MBM_DECISION_RACE";
    throw race;
  }
  const applied = (await tx.changeRequest.findUnique({ where: { id: req.id } }))!;
  return { success: true as const, alreadyDecided: false as const, request: toView(applied) };
}

export async function decideChangeRequestAsVerifiedActor(
  id: string,
  decision: { approve: boolean; note?: string },
  actor: Actor | null,
) {
  try {
    if (!id) throw new Error("Request id is required.");
    const approve = !!decision?.approve;
    const note = decision?.note?.trim() || null;
    const decidedById = actor?.id ?? null;
    const decidedByName = actor?.name ?? "setup";

    const db = await getDb();
    // Concurrent decisions: SQLite serializes writers, so a racing decision
    // can hit a lock or lose the conditional PENDING claim. Retry briefly;
    // once another decision has committed, return its recorded outcome
    // truthfully instead of a failure. The conditional claim inside the
    // transaction guarantees at most ONE apply no matter how callers race.
    for (let attempt = 0; ; attempt++) {
      try {
        const txResult = await db.$transaction(async (tx) => {
      const req = await tx.changeRequest.findUnique({ where: { id } });
      if (!req) throw new Error("Change request not found.");
      if (decidedById && req.requestedById && decidedById === req.requestedById) {
        throw new Error("You cannot approve or reject your own request. The enrolled approver must decide.");
      }
      if (req.status === "APPLIED") {
        // Replay of an already-applied decision: return the recorded outcome,
        // never a second mutation.
        return { success: true as const, alreadyDecided: true as const, request: toView(req) };
      }
      if (req.status !== "PENDING") {
        return { success: false as const, message: `This request is already ${req.status.toLowerCase()}.`, request: toView(req) };
      }

      if (!approve) {
        const claimed = await tx.changeRequest.updateMany({
          where: { id: req.id, status: "PENDING" },
          data: { status: "REJECTED", decidedById, decidedByName, decisionNote: note, decidedAt: new Date() },
        });
        if (claimed.count !== 1) {
          const race = new Error("Concurrent decision detected.");
          (race as any).code = "MBM_DECISION_RACE";
          throw race;
        }
        const rejected = (await tx.changeRequest.findUnique({ where: { id: req.id } }))!;
        await writeAuditEvent(tx, {
          entityName: "ChangeRequest",
          entityId: req.id,
          action: "update",
          role: decidedByName,
          before: { status: "PENDING" },
          after: { status: "REJECTED", decisionNote: note },
          reason: note,
        });
        return { success: true as const, alreadyDecided: false as const, request: toView(rejected) };
      }

      // Approval: atomically compare the authoritative current record, apply,
      // audit (fail-closed), and transition the request - all or nothing.
      if (req.entityName !== "OutgoingSale" || (req.operation !== "edit_remarks" && req.operation !== "edit_fields")) {
        throw new Error("This operation is not implemented. Sale deletes remain gated policy work.");
      }
      if (req.operation === "edit_fields") {
        return applySaleFieldEdit(tx, req, decidedById, decidedByName, note);
      }
      const sale = await tx.outgoingSale.findUnique({ where: { id: req.entityId } });
      // Requests filed before record-context tracking (NULL fingerprint) fail
      // closed: refuse approval, keep the request PENDING so it can be
      // cancelled and re-filed. Never guess an approval without context.
      if (sale && req.recordFingerprint == null) {
        throw new Error("This request predates record-context tracking and cannot be approved. Cancel it and file a new request.");
      }
      const currentRemarks = sale ? normalizeRemarks(sale.remarks) : null;
      const expectedRemarks = normalizeRemarks(req.originalValue);
      const fingerprintMatches = !!sale && fingerprintOutgoingSale(sale as unknown as Record<string, unknown>) === req.recordFingerprint;
      if (!sale || currentRemarks !== expectedRemarks || !fingerprintMatches) {
        const conflict = await tx.changeRequest.update({
          where: { id: req.id },
          data: {
            status: "CONFLICT",
            decidedById,
            decidedByName,
            decisionNote: note ?? "The record changed after this request was filed; nothing was applied.",
            decidedAt: new Date(),
          },
        });
        await writeAuditEvent(tx, {
          entityName: "ChangeRequest",
          entityId: req.id,
          action: "update",
          role: decidedByName,
          before: { status: "PENDING", originalValue: req.originalValue },
          after: { status: "CONFLICT", currentValue: sale ? currentRemarks : null, recordMissing: !sale, recordDrifted: !!sale && !fingerprintMatches },
          reason: "Stale record at approval time; no change applied.",
        });
        return { success: false as const, conflict: true as const, message: "The record changed after this request was filed. Nothing was applied.", request: toView(conflict) };
      }

      const updatedSale = await tx.outgoingSale.update({
        where: { id: sale.id },
        data: { remarks: normalizeRemarks(req.proposedValue) },
      });
      const audit = await writeAuditEvent(tx, {
        entityName: "Sale",
        entityId: sale.id,
        action: "update",
        role: decidedByName,
        before: { remarks: currentRemarks },
        after: { remarks: updatedSale.remarks },
        reason: `Approved change request ${req.id} filed by ${req.requestedByName}: ${req.reason}`,
      });
      const claimApplied = await tx.changeRequest.updateMany({
        where: { id: req.id, status: "PENDING" },
        data: {
          status: "APPLIED",
          decidedById,
          decidedByName,
          decisionNote: note,
          decidedAt: new Date(),
          appliedAt: new Date(),
          appliedAuditId: (audit as any)?.id ?? null,
        },
      });
      if (claimApplied.count !== 1) {
        const race = new Error("Concurrent decision detected.");
        (race as any).code = "MBM_DECISION_RACE";
        throw race;
      }
      const applied = (await tx.changeRequest.findUnique({ where: { id: req.id } }))!;
      return { success: true as const, alreadyDecided: false as const, request: toView(applied) };
        }, { timeout: 15000, maxWait: 10000 });
        // A committed apply changes the authoritative sales data; invalidate
        // the sales route so any server-rendered view refreshes. Client lists
        // also reload via the panel's onApplied callback.
        return txResult;
      } catch (error: any) {
        const raced = error?.code === "MBM_DECISION_RACE" || /database is locked|SQLITE_BUSY|socket timeout|failed to respond|expired transaction/i.test(String(error?.message ?? ""));
        const current = await db.changeRequest.findUnique({ where: { id } }).catch(() => null);
        if (raced && current && current.status !== "PENDING") {
          if (current.status === "APPLIED") return { success: true as const, alreadyDecided: true as const, request: toView(current) };
          return { success: false as const, message: `This request is already ${current.status.toLowerCase()}.`, request: toView(current) };
        }
        if (raced && attempt < 5) {
          // Brief backoff lets the winning decision commit; the next attempt
          // then returns its recorded outcome via the re-read above.
          await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
          continue;
        }
        throw error;
      }
    }
  } catch (error: any) {
    return { success: false as const, message: sanitizeError(error, "The decision could not be completed. Nothing was applied - the request is still pending. Please try again.") };
  }
}

