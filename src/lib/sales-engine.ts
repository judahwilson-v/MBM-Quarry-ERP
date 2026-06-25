export type DiscountType = "percentage" | "fixed";

export type SalesMasterVehicle = {
  id: string;
  vehicleNumber: string;
  partyId?: string | null;
  partyName?: string | null;
  companyBodyQty?: number | null;
  extraBodyQty?: number | null;
};

export type SalesMasterMaterial = {
  id: string;
  materialName: string;
  ratePerCft: number;
};

export type SalesDraft = {
  id?: string;
  saleDate?: string;
  vehicleNumber: string;
  partyName: string;
  materialId: string;
  ratePerCft?: string | number | null;
  qty: string | number;
  discountType: DiscountType;
  discountValue: string | number;
  cashPaid?: string | number | null;
  bankPaid?: string | number | null;
  gPayPaid?: string | number | null;
  remarks?: string | null;
  quantityReason?: string | null;
};

export type SalesEngineResult = {
  saleDate: Date;
  vehicleNumber: string;
  partyName: string;
  materialId: string;
  materialName: string;
  ratePerCft: number;
  qty: number;
  originalQty: number;
  qtyChanged: boolean;
  quantityReason: string | null;
  tripDelta: number;
  discountType: DiscountType;
  discountValue: number;
  amount: number;
  discountAmount: number;
  finalAmount: number;
  cashPaid: number;
  bankPaid: number;
  gPayPaid: number;
  paidTotal: number;
  remainingCredit: number;
  remarks: string | null;
};

export type SalesEngineDeps = {
  vehicle?: SalesMasterVehicle | null;
  material?: SalesMasterMaterial | null;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeVehicleNumber(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function requiredText(value: string | null | undefined, label: string) {
  const text = value?.trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function cleanText(value?: string | null) {
  const text = value?.trim() ?? "";
  return text || null;
}

function parseNumber(value: string | number | null | undefined, label: string, required = true) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new Error(`${label} is required.`);
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a valid number.`);
  return number;
}

function parseDateInput(value?: string | null) {
  if (!value) return new Date();
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error("Date is invalid.");
  return date;
}

export function deriveSalesEngine(draft: SalesDraft, deps: SalesEngineDeps) {
  const vehicleNumber = normalizeVehicleNumber(requiredText(draft.vehicleNumber, "Vehicle number"));
  const partyName = requiredText(draft.partyName, "Party name");
  const material = deps.material;
  if (!material) throw new Error("Material is required.");

  const qtyInput = parseNumber(draft.qty, "Qty") ?? 0;
  const rateInput =
    draft.ratePerCft !== undefined && draft.ratePerCft !== null && draft.ratePerCft !== ""
      ? parseNumber(draft.ratePerCft, "Rate")
      : null;

  const autoQty = deps.vehicle?.companyBodyQty ?? deps.vehicle?.extraBodyQty ?? null;
  const originalQty = qtyInput;
  const qty = autoQty && autoQty > 0 ? autoQty : qtyInput;
  const qtyChanged = autoQty !== null && autoQty !== undefined && roundMoney(originalQty) !== roundMoney(qty);
  const quantityReason = qtyChanged ? cleanText(draft.quantityReason) : null;

  if (qty <= 0) throw new Error("Qty must be greater than 0.");
  if (qtyChanged && !quantityReason) throw new Error("Quantity reason is required when quantity differs from vehicle default.");

  const ratePerCft = rateInput !== null ? rateInput : material.ratePerCft;
  if (ratePerCft < 0) throw new Error("Rate must be zero or greater.");

  const cashPaid = parseNumber(draft.cashPaid, "Cash Paid", false) ?? 0;
  const bankPaid = parseNumber(draft.bankPaid, "Bank Paid", false) ?? 0;
  const gPayPaid = parseNumber(draft.gPayPaid, "GPay Paid", false) ?? 0;
  const discountValue = parseNumber(draft.discountValue, "Discount", false) ?? 0;

  if (cashPaid < 0) throw new Error("Cash Paid cannot be negative.");
  if (bankPaid < 0) throw new Error("Bank Paid cannot be negative.");
  if (gPayPaid < 0) throw new Error("GPay Paid cannot be negative.");
  if (discountValue < 0) throw new Error("Discount cannot be negative.");
  if (!["percentage", "fixed"].includes(draft.discountType)) throw new Error("Discount type is invalid.");

  const amount = roundMoney(qty * ratePerCft);
  const discountAmount =
    draft.discountType === "percentage" ? roundMoney((amount * discountValue) / 100) : roundMoney(discountValue);
  if (discountAmount > amount) throw new Error("Discount cannot be greater than amount.");

  const finalAmount = roundMoney(amount - discountAmount);
  const paidTotal = roundMoney(cashPaid + bankPaid + gPayPaid);
  if (paidTotal > finalAmount) throw new Error("Payment cannot exceed final amount.");
  const remainingCredit = roundMoney(finalAmount - paidTotal);

  return {
    saleDate: parseDateInput(draft.saleDate),
    vehicleNumber,
    partyName,
    materialId: material.id,
    materialName: material.materialName,
    ratePerCft,
    qty: roundMoney(qty),
    originalQty: roundMoney(originalQty),
    qtyChanged,
    quantityReason,
    tripDelta: 1,
    discountType: draft.discountType,
    discountValue,
    amount,
    discountAmount,
    finalAmount,
    cashPaid,
    bankPaid,
    gPayPaid,
    paidTotal,
    remainingCredit,
    remarks: cleanText(draft.remarks),
  } satisfies SalesEngineResult;
}
