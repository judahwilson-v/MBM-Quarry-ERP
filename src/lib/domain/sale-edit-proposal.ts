import {
  OUTGOING_SALE_EDITABLE_FIELDS,
} from "@/lib/domain/change-requests/fingerprint";

// FULL64: proposed-value parsing for the sale edit-request dialog, extracted
// as a pure function so the choice validation is unit-testable without a
// browser. FULL62 left a coercion hole: a boolean field whose selector was
// still on "Choose..." parsed as FALSE (raw === "true"), so clicking Add with
// no explicit choice silently staged a real true -> false change. FULL64
// requires an explicit Yes/No choice for boolean fields; blank is invalid,
// never coerced.

export const NUMBER_FIELDS = new Set(["ratePerCft", "qty", "discountValue", "cashPaid", "bankPaid", "gPayPaid"]);
export const BOOLEAN_FIELDS = new Set(["gstEnabled"]);
export const DATE_FIELDS = new Set(["saleDate"]);

export const FIELD_LABELS: Record<string, string> = {
  saleDate: "Date",
  bookNumber: "Book number",
  pageNumber: "Page number",
  vehicleNumber: "Vehicle number",
  partyName: "Party name",
  materialName: "Material",
  ratePerCft: "Rate per cft",
  qty: "Quantity",
  discountType: "Discount type",
  discountValue: "Discount value",
  gstEnabled: "GST enabled",
  cashPaid: "Cash paid",
  bankPaid: "Bank paid",
  gPayPaid: "GPay paid",
  remarks: "Remarks",
};

export const DEFAULT_EDIT_FIELD = OUTGOING_SALE_EDITABLE_FIELDS[0];

export function parseProposedValue(f: string, raw: string): unknown {
  if (BOOLEAN_FIELDS.has(f)) {
    // Explicit choice only: anything that is not literally "true" or "false"
    // (including the untouched "Choose..." placeholder) is invalid.
    if (raw !== "true" && raw !== "false") {
      throw new Error(`Choose Yes or No for ${FIELD_LABELS[f] ?? f}.`);
    }
    return raw === "true";
  }
  if (NUMBER_FIELDS.has(f)) {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${FIELD_LABELS[f] ?? f} must be a finite number.`);
    return n;
  }
  if (DATE_FIELDS.has(f)) {
    if (raw.trim() === "") return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) throw new Error("Date is invalid.");
    return d.toISOString();
  }
  return raw;
}
