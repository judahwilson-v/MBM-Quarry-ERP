"use server";

// Edit/delete request-approval trail (FULL56 remarks-only proof).
//
// Boundary:
// - Filing a request NEVER mutates the target record; it writes only the
//   immutable request row plus a fail-closed audit event.
// - Requester identity is the server-resolved session actor, never client
//   input. Legacy edit/delete PINs neither create nor approve requests.
// - Decisions require the configured owner-authorized control principal
//   (requireControlActor, same boundary as FULL55). No self-approval.
// - Approval applies atomically: conflict re-check + business mutation +
//   fail-closed audit + request transition in ONE transaction. Any failure
//   rolls back everything.
// - Retried submissions are idempotent; re-applying a decided request never
//   mutates twice. Denial/cancel/conflict outcomes are retained history.
// - This proof wires ONLY the "edit_remarks" operation on OutgoingSale.
//   Monetary edits and delete requests remain gated policy work.

import { decideChangeRequestAsVerifiedActor } from "@/lib/domain/change-requests/decision-service";
import { getDb } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
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

export async function requestSaleRemarksEdit(
  input: { saleId: string; proposedRemarks: string; reason: string; idempotencyKey: string },
  sessionToken?: string | null,
) {
  try {
    const actor = await requireActor(sessionToken);
    const saleId = input?.saleId;
    const reason = input?.reason?.trim();
    const key = input?.idempotencyKey?.trim();
    if (!saleId || !key) throw new Error("Sale and idempotency key are required.");
    if (!reason) throw new Error("A reason is required so the approver can judge the change.");
    if (typeof input.proposedRemarks !== "string") throw new Error("Proposed remarks are required.");

    const db = await getDb();
    const sale = await db.outgoingSale.findUnique({ where: { id: saleId } });
    if (!sale) throw new Error("Sale not found.");
    const current = normalizeRemarks(sale.remarks);
    if (normalizeRemarks(input.proposedRemarks) === current) {
      throw new Error("Proposed remarks are the same as the current remarks.");
    }
    const fingerprint = fingerprintOutgoingSale(sale as unknown as Record<string, unknown>);

    const requestedById = actor?.id ?? null;
    const requestedByName = actor?.name ?? "setup";
    try {
      const created = await db.$transaction(async (tx) => {
        const row = await tx.changeRequest.create({
          data: {
            idempotencyKey: key,
            entityName: "OutgoingSale",
            entityId: saleId,
            operation: "edit_remarks",
            originalValue: current,
            proposedValue: input.proposedRemarks,
            reason,
            requestedById,
            requestedByName,
            recordFingerprint: fingerprint,
          },
        });
        await writeAuditEvent(tx, {
          entityName: "ChangeRequest",
          entityId: row.id,
          action: "create",
          role: requestedByName,
          after: {
            operation: "edit_remarks",
            entityName: "OutgoingSale",
            entityId: saleId,
            originalValue: current,
            proposedValue: input.proposedRemarks,
            reason,
          },
        });
        return row;
      });
      return { success: true as const, duplicate: false as const, request: toView(created) };
    } catch (error: any) {
      // Idempotent retry: the unique idempotency key makes a retried submit
      // return the original request instead of filing a duplicate.
      if (typeof error?.code === "string" && error.code === "P2002") {
        const existing = await db.changeRequest.findUnique({ where: { idempotencyKey: key } });
        if (existing) {
          // Idempotent retry ONLY when the retry is byte-identical in what it
          // asks: same server-resolved requester, target, operation, proposal
          // and reason. A key reused for a different request is refused
          // WITHOUT returning the original request's contents, so one worker
          // cannot probe another worker's requests by guessing keys.
          const bound =
            existing.requestedById === requestedById &&
            existing.entityName === "OutgoingSale" &&
            existing.entityId === saleId &&
            existing.operation === "edit_remarks" &&
            existing.proposedValue === input.proposedRemarks &&
            existing.reason === reason;
          if (!bound) throw new Error("This idempotency key was already used for a different request.");
          return { success: true as const, duplicate: true as const, request: toView(existing) };
        }
      }
      throw error;
    }
  } catch (error: any) {
    return { success: false as const, message: sanitizeError(error, "Could not file the change request. Nothing was submitted.") };
  }
}

// FULL60: shared filing core for the capture-only operations. Same binding
// discipline as the remarks flow: unique idempotency key, and a retried submit
// returns the original request ONLY when it is byte-identical in what it asks
// (server-resolved requester, target, operation, proposal, reason) - a reused
// key is refused WITHOUT disclosing the original request's contents.
async function createBoundRequest(
  db: any,
  opts: {
    key: string;
    operation: string;
    saleId: string;
    originalValue: string | null;
    proposedValue: string | null;
    reason: string;
    requestedById: string | null;
    requestedByName: string;
    fingerprint: string;
  },
): Promise<{ row: any; duplicate: boolean }> {
  try {
    const row = await db.$transaction(async (tx: any) => {
      const created = await tx.changeRequest.create({
        data: {
          idempotencyKey: opts.key,
          entityName: "OutgoingSale",
          entityId: opts.saleId,
          operation: opts.operation,
          originalValue: opts.originalValue,
          proposedValue: opts.proposedValue,
          reason: opts.reason,
          requestedById: opts.requestedById,
          requestedByName: opts.requestedByName,
          recordFingerprint: opts.fingerprint,
        },
      });
      await writeAuditEvent(tx, {
        entityName: "ChangeRequest",
        entityId: created.id,
        action: "create",
        role: opts.requestedByName,
        after: {
          operation: opts.operation,
          entityName: "OutgoingSale",
          entityId: opts.saleId,
          originalValue: opts.originalValue,
          proposedValue: opts.proposedValue,
          reason: opts.reason,
        },
      });
      return created;
    });
    return { row, duplicate: false };
  } catch (error: any) {
    if (typeof error?.code === "string" && error.code === "P2002") {
      const existing = await db.changeRequest.findUnique({ where: { idempotencyKey: opts.key } });
      if (existing) {
        const bound =
          existing.requestedById === opts.requestedById &&
          existing.entityName === "OutgoingSale" &&
          existing.entityId === opts.saleId &&
          existing.operation === opts.operation &&
          existing.proposedValue === opts.proposedValue &&
          existing.reason === opts.reason;
        if (!bound) throw new Error("This idempotency key was already used for a different request.");
        return { row: existing, duplicate: true };
      }
    }
    throw error;
  }
}

/**
 * FULL60: capture a full-field sale edit request. Capture + approver diff
 * ONLY: applying monetary edits is gated policy work (the approval path
 * refuses every non-remarks operation truthfully), so this never changes the
 * record. Field whitelist excludes derived totals; proposed values are plain
 * JSON scalars; the stored proposal is an ordered per-field map so the
 * approver sees an exact before/after diff.
 */
export async function requestSaleFieldEdit(
  input: { saleId: string; changes: Record<string, unknown>; reason: string; idempotencyKey: string },
  sessionToken?: string | null,
) {
  try {
    const actor = await requireActor(sessionToken);
    const saleId = input?.saleId;
    const reason = input?.reason?.trim();
    const key = input?.idempotencyKey?.trim();
    if (!saleId || !key) throw new Error("Sale and idempotency key are required.");
    if (!reason) throw new Error("A reason is required so the approver can judge the change.");
    const changes = input?.changes;
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw new Error("Proposed changes are required.");
    for (const [field, value] of Object.entries(changes)) {
      if (!(OUTGOING_SALE_EDITABLE_FIELDS as readonly string[]).includes(field)) {
        throw new Error(`Field "${field}" cannot be changed through a change request.`);
      }
      if (value !== null && !["string", "number", "boolean"].includes(typeof value)) {
        throw new Error(`Field "${field}" has an unsupported value.`);
      }
      // FULL62 (QA correction): JSON serializes NaN and ±Infinity as null,
      // which would silently turn a bad proposal into a null in the stored
      // diff. Reject non-finite numbers instead of coercing.
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new Error(`Field "${field}" must be a finite number.`);
      }
    }
    // Fixed whitelist order, never submission order.
    const fields = OUTGOING_SALE_EDITABLE_FIELDS.filter((f) => f in changes);
    if (!fields.length) throw new Error("Proposed changes are required.");

    const db = await getDb();
    const sale = await db.outgoingSale.findUnique({ where: { id: saleId } });
    if (!sale) throw new Error("Sale not found.");
    const originalAll = snapshotSaleFields(sale as unknown as Record<string, unknown>, fields);
    // No-op detection at display granularity: NULL and "" compare equal.
    const differing = fields.filter((f) => String(originalAll[f] ?? "") !== String((changes as any)[f] ?? ""));
    if (!differing.length) throw new Error("The proposed changes match the current record.");
    const original: Record<string, unknown> = {};
    const proposed: Record<string, unknown> = {};
    for (const f of differing) {
      original[f] = originalAll[f];
      proposed[f] = (changes as any)[f] ?? null;
    }
    const fingerprint = fingerprintOutgoingSale(sale as unknown as Record<string, unknown>);
    const { row, duplicate } = await createBoundRequest(db, {
      key,
      operation: "edit_fields",
      saleId,
      originalValue: JSON.stringify(original),
      proposedValue: JSON.stringify(proposed),
      reason,
      requestedById: actor?.id ?? null,
      requestedByName: actor?.name ?? "setup",
      fingerprint,
    });
    return { success: true as const, duplicate, request: toView(row) };
  } catch (error: any) {
    return { success: false as const, message: sanitizeError(error, "Could not file the change request. Nothing was submitted.") };
  }
}

/**
 * FULL60: capture a sale deletion request. Capture + approver review ONLY:
 * the record is never touched, and the approval path refuses applies until
 * the owner's delete accounting policy (void vs removal) is decided. The
 * original value carries a full ordered business-field snapshot so the
 * approver sees exactly what would be deleted.
 */
export async function requestSaleDelete(
  input: { saleId: string; reason: string; idempotencyKey: string },
  sessionToken?: string | null,
) {
  try {
    const actor = await requireActor(sessionToken);
    const saleId = input?.saleId;
    const reason = input?.reason?.trim();
    const key = input?.idempotencyKey?.trim();
    if (!saleId || !key) throw new Error("Sale and idempotency key are required.");
    if (!reason) throw new Error("A reason is required so the approver can judge the deletion.");

    const db = await getDb();
    const sale = await db.outgoingSale.findUnique({ where: { id: saleId } });
    if (!sale) throw new Error("Sale not found.");
    const snapshot = snapshotSaleFields(sale as unknown as Record<string, unknown>, OUTGOING_SALE_BUSINESS_FIELDS);
    const fingerprint = fingerprintOutgoingSale(sale as unknown as Record<string, unknown>);
    const { row, duplicate } = await createBoundRequest(db, {
      key,
      operation: "delete",
      saleId,
      originalValue: JSON.stringify(snapshot),
      proposedValue: null,
      reason,
      requestedById: actor?.id ?? null,
      requestedByName: actor?.name ?? "setup",
      fingerprint,
    });
    return { success: true as const, duplicate, request: toView(row) };
  } catch (error: any) {
    return { success: false as const, message: sanitizeError(error, "Could not file the delete request. Nothing was submitted.") };
  }
}

export async function listChangeRequests(sessionToken?: string | null) {
  try {
    const viewer = await requireActor(sessionToken);
    const db = await getDb();
    const setupMode = !viewer && isIdentitySetupCompatibilityMode() && !(await isEnrollmentComplete().catch(() => true));
    const rows = await db.changeRequest.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return { success: true as const, requests: rows.map((row) => toView(row, viewer?.id ?? null, setupMode)) };
  } catch (error: any) {
    return { success: false as const, message: sanitizeError(error, "Could not load change requests."), requests: [] as ChangeRequestView[] };
  }
}

export async function decideChangeRequest(
  id: string,
  decision: { approve: boolean; note?: string },
  sessionToken?: string | null,
) {
  try {
    const actor = await requireControlActor(sessionToken);
    const result = await decideChangeRequestAsVerifiedActor(id, decision, actor);
    if (result.success && result.request?.status === "APPLIED") revalidatePath("/sales");
    return result;
  } catch (error) {
    return { success: false as const, message: sanitizeError(error, "The decision could not be completed. Nothing was applied.") };
  }
}

export async function cancelChangeRequest(id: string, sessionToken?: string | null) {
  try {
    const actor = await requireActor(sessionToken);
    if (!id) throw new Error("Request id is required.");
    const db = await getDb();
    return await db.$transaction(async (tx) => {
      const req = await tx.changeRequest.findUnique({ where: { id } });
      if (!req) throw new Error("Change request not found.");
      if (req.status !== "PENDING") {
        return { success: false as const, message: `This request is already ${req.status.toLowerCase()}.`, request: toView(req) };
      }
      const cancellerId = actor?.id ?? null;
      const cancellerName = actor?.name ?? "setup";
      // Only the requester may cancel their own pending request. In setup
      // compatibility mode (no enrollment) requests carry no requester id and
      // cancellation is open, matching the setup boundary.
      if (await isEnrollmentComplete()) {
        if (!cancellerId || cancellerId !== req.requestedById) {
          throw new Error("Only the worker who filed this request can cancel it.");
        }
      } else if (!isIdentitySetupCompatibilityMode()) {
        throw new Error("Identity enrollment is not configured. Setup is unavailable in this build.");
      }
      const cancelled = await tx.changeRequest.update({
        where: { id: req.id },
        data: { status: "CANCELLED", decidedById: cancellerId, decidedByName: cancellerName, decisionNote: "Cancelled by requester.", decidedAt: new Date() },
      });
      await writeAuditEvent(tx, {
        entityName: "ChangeRequest",
        entityId: req.id,
        action: "update",
        role: cancellerName,
        before: { status: "PENDING" },
        after: { status: "CANCELLED" },
        reason: "Cancelled by requester.",
      });
      return { success: true as const, request: toView(cancelled) };
    });
  } catch (error: any) {
    return { success: false as const, message: sanitizeError(error, "Could not cancel the change request. Nothing was changed.") };
  }
}
