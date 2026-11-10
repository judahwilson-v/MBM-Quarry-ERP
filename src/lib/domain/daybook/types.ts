export type DayBookExpenseType = "DIESEL" | "LABOUR" | "REPAIRS" | "LOADING" | "MISCELLANEOUS";

export type DayBookExpenseInput = {
  businessDate: string;
  expenseType: DayBookExpenseType;
  amount: number;
  description?: string | null;
  sourceKind?: "MANUAL_CASH" | "BOULDER_IMMEDIATE";
  sourceEntityId?: string;
  paymentMode?: "CASH";
  paymentBreakdown?: { cashPaid: number; bankPaid: number; gPayPaid: number };
};

export type DayBookOpeningBalanceInput = {
  businessDate: string;
  openingCashBalance: number;
  openingBankBalance: number;
};
