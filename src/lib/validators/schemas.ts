import { z } from "zod";

/**
 * Validates data against a Zod schema. If validation fails, throws a standard Error
 * with the first human-readable issue message for safe exposure via sanitizeError.
 */
export function validateWithSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const message = firstIssue ? firstIssue.message : "Invalid input data.";
    throw new Error(message);
  }
  return result.data;
}

/**
 * Coerces string/number/null/undefined inputs to number or null cleanly.
 */
export const optionalNumber = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((val) => {
    if (val === null || val === undefined || val === "") return null;
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  });

/**
 * Validates required numeric fields with custom label and minimum value constraint.
 */
export const requiredNumber = (label: string, min?: number) =>
  z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((val, ctx) => {
      if (val === null || val === undefined || val === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is required.` });
        return z.NEVER;
      }
      const num = Number(val);
      if (!Number.isFinite(num)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a valid number.` });
        return z.NEVER;
      }
      if (min !== undefined && num < min) {
        const minMsg =
          min === 0
            ? `${label} cannot be negative.`
            : min > 0 && min < 1
            ? `${label} must be greater than 0.`
            : `${label} must be at least ${min}.`;
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: minMsg });
        return z.NEVER;
      }
      return num;
    });

/* ==========================================
 * 1. Sales Schemas
 * ========================================== */

export const SaleInputSchema = z.object({
  id: z.string().optional().nullable(),
  saleDate: z.union([z.string(), z.date()]).optional().nullable(),
  vehicleNumber: z.string().min(1, "Vehicle number is required."),
  partyName: z.string().optional().nullable().default(""),
  partyId: z.string().optional().nullable(),
  materialId: z.string().min(1, "Material is required."),
  ratePerCft: optionalNumber,
  qty: requiredNumber("Qty", 0.0001),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: requiredNumber("Discount", 0),
  cashPaid: optionalNumber,
  bankPaid: optionalNumber,
  gPayPaid: optionalNumber,
  remarks: z.string().optional().nullable(),
  bookNumber: optionalNumber,
  pageNumber: optionalNumber,
  quantityReason: z.string().optional().nullable(),
  gstEnabled: z.boolean().optional().nullable(),
  vehicleId: z.string().optional().nullable(),
});

export const DeleteSaleSchema = z.object({
  id: z.string().min(1, "Sale ID is required."),
  pin: z.string().optional().nullable(),
});

/* ==========================================
 * 2. Purchases Schemas
 * ========================================== */

export const IncomingBoulderInputSchema = z.object({
  id: z.string().optional().nullable(),
  date: z.union([z.string(), z.date()]).optional().nullable(),
  bookNumber: optionalNumber,
  pageNumber: optionalNumber,
  vehicleNumber: z.string().min(1, "Vehicle number is required."),
  partyName: z.string().optional().nullable().default(""),
  qty: requiredNumber("Qty", 0.0001),
  rockRate: optionalNumber,
  cashPaid: optionalNumber,
  bankPaid: optionalNumber,
  gPayPaid: optionalNumber,
  vehicleRent: optionalNumber,
  combinedPayment: z.boolean().optional().nullable(),
  time: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export const DeleteIncomingBoulderSchema = z.object({
  id: z.string().min(1, "Boulder entry ID is required."),
  pin: z.string().min(1, "Admin/Delete PIN is required to delete records."),
});

/* ==========================================
 * 3. Expenses Schemas
 * ========================================== */

export const ExpenseInputSchema = z.object({
  id: z.string().optional().nullable(),
  expenseDate: z.union([z.string(), z.date()]).optional().nullable(),
  expenseType: z.string().min(1, "Expense type is required."),
  amount: requiredNumber("Amount", 0.01),
  paymentMode: z.string().optional().default("CASH"),
  partyId: z.string().optional().nullable(),
  partyName: z.string().optional().nullable(),
  vehicleId: z.string().optional().nullable(),
  vehicleNumber: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

export const DeleteExpenseSchema = z.object({
  id: z.string().min(1, "Expense ID is required."),
  pin: z.string().optional().nullable(),
});

/* ==========================================
 * 4. Credits Schemas
 * ========================================== */

export const PartyCollectionInputSchema = z.object({
  partyName: z.string().min(1, "Party name is required."),
  cashPaid: optionalNumber,
  bankPaid: optionalNumber,
  gPayPaid: optionalNumber,
  collectionDate: z.union([z.string(), z.date()]).optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export const PartyPaymentInputSchema = z.object({
  partyName: z.string().min(1, "Party name is required."),
  cashPaid: optionalNumber,
  bankPaid: optionalNumber,
  gPayPaid: optionalNumber,
  paymentDate: z.union([z.string(), z.date()]).optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export const DeletePartyCollectionSchema = z.object({
  id: z.string().min(1, "Collection ID is required."),
  pin: z.string().optional().nullable(),
});

export const DeletePartyPaymentSchema = z.object({
  id: z.string().min(1, "Payment ID is required."),
  pin: z.string().optional().nullable(),
});

export const OtherCreditInputSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().min(1, "Name is required."),
  amount: requiredNumber("Amount", 0.01),
  reason: z.string().optional().nullable(),
  expectedDueDate: z.union([z.string(), z.date()]).optional().nullable(),
  status: z.string().optional().default("pending"),
});

export const DeleteOtherCreditSchema = z.object({
  id: z.string().min(1, "Other credit ID is required."),
});

/* ==========================================
 * 5. Weighbridge Schemas
 * ========================================== */

export const CreateWeighbridgeTicketSchema = z.object({
  vehicleNumber: z.string().min(1, "Vehicle number is required."),
  partyId: z.string().optional().nullable(),
  materialId: z.string().optional().nullable(),
  ticketType: z.enum(["INCOMING", "OUTGOING"]).optional().default("OUTGOING"),
  weight: requiredNumber("Weight", 0.0001),
});

export const CompleteWeighbridgeTicketSchema = z.object({
  ticketId: z.string().min(1, "Ticket ID is required."),
  finalWeight: requiredNumber("Final weight", 0),
});

export const VoidWeighbridgeTicketSchema = z.object({
  ticketId: z.string().min(1, "Ticket ID is required."),
  remarks: z.string().min(1, "Remarks are required to void a ticket."),
});
