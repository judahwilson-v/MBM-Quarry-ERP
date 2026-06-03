import { z } from "zod";

const decimalString = z.union([z.string(), z.number()]).transform((value) => String(value));

export const partySchema = z.object({
  name: z.string().trim().min(1, "Party Name is required."),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  gstNumber: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const vehicleSchema = z.object({
  vehicleNumber: z
    .string()
    .min(1, "Vehicle number is required")
    .transform((value) => value.toUpperCase().trim().replace(/\s+/g, " ")),
  ownerName: z.string().optional().nullable(),
  companyBody: z.boolean().default(false),
  extraBody: z.boolean().default(false),
  isPickup: z.boolean().default(false),
  bodyRemarks: z.string().optional().nullable(),
  partyId: z.string().optional().nullable(),
  capacity: decimalString.optional().nullable(),
  defaultQty: decimalString.optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export const materialSchema = z.object({
  name: z.string().min(1, "Material name is required"),
  code: z.string().min(1).transform((value) => value.toUpperCase().trim()),
  unit: z.enum(["CFT"]).default("CFT"),
  currentRate: decimalString.default("0"),
  currentStock: decimalString.default("0"),
  reorderLevel: decimalString.default("0"),
  isActive: z.boolean().default(true),
});

export const driverSchema = z.object({
  name: z.string().min(1, "Driver name is required"),
  mobile: z.string().optional().nullable(),
  vehicleId: z.string().optional().nullable(),
});

export const saleSchema = z.object({
  clientId: z.string().optional(),
  date: z.string().or(z.date()).default(() => new Date().toISOString()),
  time: z.string().optional().nullable(),
  vehicleId: z.string().optional().nullable(),
  vehicleNumber: z.string().trim().optional().nullable(),
  partyId: z.string().optional().nullable(),
  partyName: z.string().trim().optional().nullable(),
  materialId: z.string().min(1, "Material is required"),
  driverId: z.string().optional().nullable(),
  qty: decimalString,
  rate: decimalString,
  grossAmount: decimalString,
  discountType: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]).optional().nullable(),
  discountValue: decimalString.optional().nullable(),
  discountAmount: decimalString.default("0"),
  netAmount: decimalString,
  paymentType: z.enum(["CASH", "BANK", "GPAY", "CREDIT", "MIXED"]),
  cashAmount: decimalString.default("0"),
  bankAmount: decimalString.default("0"),
  gpayAmount: decimalString.default("0"),
  creditAmount: decimalString.default("0"),
  bankRef: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  operatorName: z.string().optional().nullable(),
  setAsNewDefault: z.boolean().optional(),
  allowNegativeStock: z.boolean().optional(),
});

export const paymentSchema = z.object({
  partyId: z.string().min(1),
  date: z.string().or(z.date()).default(() => new Date().toISOString()),
  amount: decimalString,
  method: z.enum(["CASH", "BANK", "GPAY"]),
  details: z.string().optional().nullable(),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required."),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  gstNumber: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const purchaseSchema = z.object({
  date: z.string().or(z.date()).default(() => new Date().toISOString()),
  category: z.enum(["MATERIAL", "DIESEL", "SPARE_PARTS", "MAINTENANCE", "SALARY", "OTHER"]),
  supplierId: z.string().optional().nullable(),
  supplierName: z.string().trim().optional().nullable(),
  materialId: z.string().optional().nullable(),
  description: z.string().trim().min(1, "Description is required."),
  qty: decimalString.optional().nullable(),
  unit: z.string().optional().nullable(),
  rate: decimalString.optional().nullable(),
  amount: decimalString,
  paymentType: z.enum(["CASH", "BANK", "GPAY"]),
  invoiceRef: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export const purchaseEntrySchema = z.object({
  date: z.string().or(z.date()).default(() => new Date().toISOString()),
  time: z.string().optional().nullable(),
  vehicleId: z.string().optional().nullable(),
  vehicleNumber: z.string().trim().min(1, "Vehicle Number is required."),
  supplierId: z.string().optional().nullable(),
  supplierName: z.string().trim().min(1, "Supplier Name is required."),
  material: z.string().trim().min(1, "Material is required."),
  qty: decimalString,
  rate: decimalString,
  amount: decimalString,
  remarks: z.string().optional().nullable(),
});

export const employeeSchema = z.object({
  name: z.string().trim().min(1, "Employee name is required."),
  role: z.string().trim().min(1, "Employee role is required."),
  baseSalary: decimalString.default("0"),
  phone: z.string().optional().nullable(),
  joinDate: z.string().or(z.date()).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const pendingBookSchema = z.object({
  employeeId: z.string().min(1, "Employee is required."),
  date: z.string().or(z.date()).default(() => new Date().toISOString()),
  amount: decimalString,
  reason: z.string().trim().min(1, "Reason is required."),
  notes: z.string().optional().nullable(),
});

export const accountsEntrySchema = z.object({
  date: z.string().or(z.date()).default(() => new Date().toISOString()),
  transactionType: z.enum([
    "OPENING_BALANCE",
    "CASH_SALE",
    "BANK_SALE",
    "GPAY_SALE",
    "CREDIT_SALE",
    "PAYMENT_RECEIVED",
    "SALARY",
    "GENERATOR_EXPENSE",
    "DIESEL_EXPENSE",
    "OXYGEN_EXPENSE",
    "MAINTENANCE",
    "PURCHASE",
    "MISCELLANEOUS",
    "CLOSING_BALANCE",
  ]),
  refId: z.string().optional().nullable(),
  details: z.string().min(1),
  debit: decimalString.default("0"),
  credit: decimalString.default("0"),
  isCash: z.boolean().default(false),
  isBank: z.boolean().default(false),
  isGpay: z.boolean().default(false),
});

export const productionSchema = z.object({
  materialId: z.string().min(1),
  qty: decimalString,
  notes: z.string().optional().nullable(),
});

export const reconciliationSchema = z.object({
  partyId: z.string().min(1),
  name: z.string().min(1),
  date: z.string().or(z.date()).default(() => new Date().toISOString()),
  rows: z
    .array(
      z.object({
        description: z.string().min(1),
        rateQty: decimalString,
        multiplier: z.coerce.number().int().positive(),
      }),
    )
    .min(1),
});
