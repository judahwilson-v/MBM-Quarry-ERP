import type { Prisma } from "@prisma/client";


type DayBookExpenseEvent = {
  eventId: string;
  correlationId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  createdAt: Date;
  payload: Prisma.JsonValue;
};

export function projectDayBookExpense(event: DayBookExpenseEvent, targetDayBookId?: string) {
  if (event.eventType !== "DAY_BOOK_EXPENSE_CREATED" && event.eventType !== "EXPENSE_CREATED") {
    throw new Error(`Unsupported financial event type for day book projection: ${event.eventType}`);
  }

  const payload = event.payload as Prisma.JsonObject | null;
  if (!payload) throw new Error("Expense payload is required.");

  const expenseType = (payload.expenseType as string) || "MISCELLANEOUS";
  const amount = Number(payload.amount ?? 0);
  // For EXPENSE_CREATED, the date is 'expenseDate'. For DAY_BOOK_EXPENSE_CREATED, it's 'businessDate'
  const businessDate = String(payload.expenseDate || payload.businessDate || "").trim();
  const dayBookId = targetDayBookId || String(payload.dayBookId ?? "").trim();
  const description = payload.description === null || payload.description === undefined ? null : String(payload.description);

  if (!dayBookId) throw new Error("Day book ID is required.");
  if (!businessDate) throw new Error("Business date is required.");
  if (!expenseType) throw new Error("Expense type is required.");
  if (!Number.isFinite(amount)) throw new Error("Expense amount must be a valid number.");

  return {
    sourceEventId: event.eventId,
    dayBookId,
    expenseType,
    entryDate: new Date(businessDate),
    amount,
    description,
  };
}
