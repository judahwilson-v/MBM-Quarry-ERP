export type FinancialEventType =
  | "SALE_CREATED"
  | "DAY_BOOK_EXPENSE_CREATED"
  | "PARTY_COLLECTION_CREATED"
  | "PARTY_PAYMENT_CREATED"
  | "EXPENSE_CREATED"
  | "PARTY_COLLECTION_DELETED"
  | "PARTY_PAYMENT_DELETED";

export type FinancialEventEntityType = "Sale" | "DayBookExpense" | "PartyCollection"
  | "PartyPayment" | "Expense";

export type SaleFinancialEventPayload = {
  saleId: string;
  bookNumber: number | null;
  pageNumber: number | null;
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
  gstEnabled?: boolean;
  gstRate?: number;
  sgst?: number;
  cgst?: number;
  gstAmount?: number;
  finalAmount: number;
  cashPaid: number;
  bankPaid: number;
  gPayPaid: number;
  paidTotal: number;
  remainingCredit: number;
  tripDelta: number;
  remarks: string | null;
};

export type DayBookExpensePayload = {
  dayBookId: string;
  businessDate: string;
  expenseType: "DIESEL" | "LABOUR" | "REPAIRS" | "LOADING" | "MISCELLANEOUS";
  amount: number;
  description: string | null;
};

export type PartyCollectionPayload = {
  partyId: string | null;
  partyName: string;
  collectionDate: string;
  cashPaid: number;
  bankPaid: number;
  gPayPaid: number;
  totalAmount: number;
  remarks: string | null;
};



export type ExpensePayload = {
  expenseDate: string;
  expenseType: string;
  amount: number;
  paymentMode: string;
  partyId?: string | null;
  partyName?: string | null;
  vehicleId?: string | null;
  vehicleNumber?: string | null;
  description?: string | null;
};

export type PartyPaymentPayload = {
  partyId: string | null;
  partyName: string;
  paymentDate: string;
  cashPaid: number;
  bankPaid: number;
  gPayPaid: number;
  totalAmount: number;
  remarks: string | null;
};

export type FinancialEventPayload = SaleFinancialEventPayload | DayBookExpensePayload | PartyCollectionPayload | PartyPaymentPayload | ExpensePayload;
export type FinancialEventInput = {
  correlationId: string;
  eventType: FinancialEventType;
  entityType: FinancialEventEntityType;
  entityId: string;
  schemaVersion?: number;
  payload: FinancialEventPayload;
};
