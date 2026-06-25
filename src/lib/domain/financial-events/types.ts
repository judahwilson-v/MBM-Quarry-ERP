export type FinancialEventType = "SALE_CREATED";

export type FinancialEventEntityType = "Sale";

export type FinancialEventPayload = {
  saleId: string;
  serialNumber: number;
  saleDate: string;
  vehicleId: string | null;
  partyId: string | null;
  materialId: string | null;
  vehicleNumber: string;
  partyName: string;
  materialName: string;
  qty: number;
  originalQty: number;
  quantityReason: string | null;
  ratePerCft: number;
  amount: number;
  discountType: "percentage" | "fixed";
  discountValue: number;
  finalAmount: number;
  cashPaid: number;
  bankPaid: number;
  gPayPaid: number;
  paidTotal: number;
  remainingCredit: number;
  tripDelta: number;
  remarks: string | null;
};

export type FinancialEventInput = {
  correlationId: string;
  eventType: FinancialEventType;
  entityType: FinancialEventEntityType;
  entityId: string;
  schemaVersion?: number;
  payload: FinancialEventPayload;
};
