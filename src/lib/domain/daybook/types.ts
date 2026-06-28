export type DayBookExpenseType = "DIESEL" | "LABOUR" | "REPAIRS" | "LOADING" | "MISCELLANEOUS";

export type DayBookExpenseInput = {
  businessDate: string;
  expenseType: DayBookExpenseType;
  amount: number;
  description?: string | null;
};

export type DayBookOpeningBalanceInput = {
  businessDate: string;
  openingCashBalance: number;
  openingBankBalance: number;
};
