import crypto from "crypto";

// FULL57: canonical record-context fingerprint for the change-request trail.
//
// What this is: a STATE-DRIFT guard. The fingerprint captures the target
// record's business state at filing time and is recomputed inside the
// approval transaction; if the record's current state differs from the state
// the requester filed against, approval conflicts instead of applying.
//
// What this is NOT: change-since-request (ABA) detection or full concurrency
// control. A field changed and changed back between filing and approval
// produces the same fingerprint and is not detected. updatedAt is excluded
// deliberately - it is volatile (@updatedAt) and would false-conflict on
// every touch.
//
// Serialization contract: explicit fixed field order (never Object.keys
// order), typed encoding per value, no locale/date/decimal ambiguity:
//   null/undefined -> "null"
//   Date           -> "date:<ISO-8601 UTC>"
//   number         -> "num:<String(number)>"  (-0 pinned to "0")
//   boolean        -> "bool:true|false"
//   string         -> "str:<JSON string>"     (escapes embedded separators)
// Fields are the persisted scalar business columns of OutgoingSale; id,
// createdAt and updatedAt are excluded (identity/volatile, not business
// state). Relation objects are never serialized.

export const OUTGOING_SALE_BUSINESS_FIELDS = [
  "saleDate",
  "serialNumber",
  "bookNumber",
  "pageNumber",
  "vehicleId",
  "partyId",
  "materialId",
  "vehicleNumber",
  "partyName",
  "materialName",
  "ratePerCft",
  "qty",
  "originalQty",
  "quantityReason",
  "tripDelta",
  "discountType",
  "discountValue",
  "amount",
  "gstEnabled",
  "gstRate",
  "sgst",
  "cgst",
  "gstAmount",
  "finalAmount",
  "cashPaid",
  "bankPaid",
  "gPayPaid",
  "paidTotal",
  "remainingCredit",
  "remarks",
] as const;

function encodeValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (value instanceof Date) return `date:${value.toISOString()}`;
  if (typeof value === "number") return `num:${Object.is(value, -0) ? "0" : String(value)}`;
  if (typeof value === "boolean") return `bool:${value}`;
  return `str:${JSON.stringify(String(value))}`;
}

export function fingerprintOutgoingSale(sale: Record<string, unknown>): string {
  const canonical = OUTGOING_SALE_BUSINESS_FIELDS.map((field) => `${field}=${encodeValue(sale[field])}`).join("\n");
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

// Remarks normalization contract: NULL and "" are the SAME empty remarks,
// at capture, at the same-remarks no-op check, at the approval comparison,
// and at the applied write. Never compare raw NULL against "".
export function normalizeRemarks(value: string | null | undefined): string {
  return value ?? "";
}

// FULL60: fields a worker may propose changing through an edit_fields request.
// Input-level business fields only; derived totals (amount/finalAmount/
// paidTotal/remainingCredit/GST splits) are excluded - their recompute policy
// is a pending owner decision, and apply is gated policy work regardless.
export const OUTGOING_SALE_EDITABLE_FIELDS = [
  "saleDate",
  "bookNumber",
  "pageNumber",
  "vehicleNumber",
  "partyName",
  "materialName",
  "ratePerCft",
  "qty",
  "discountType",
  "discountValue",
  "gstEnabled",
  "cashPaid",
  "bankPaid",
  "gPayPaid",
  "remarks",
] as const;

// Display-oriented ordered snapshot for approver-visible diffs. JSON-safe:
// Date -> ISO string, undefined -> null, scalars as-is. Field order comes
// from the caller's fixed list, never Object.keys order.
export function snapshotSaleFields(sale: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = sale[f];
    out[f] = v instanceof Date ? v.toISOString() : v === undefined ? null : v;
  }
  return out;
}
