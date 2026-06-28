import type { Prisma } from "@prisma/client";
import type { LedgerEntryPayload, LedgerProjectionInput } from "./types";

function assertSaleCreatedEvent(input: LedgerProjectionInput["event"]): LedgerEntryPayload {
  if (input.eventType !== "SALE_CREATED") {
    throw new Error(`Unsupported financial event type for ledger projection: ${input.eventType}`);
  }

  const payload = input.payload as Prisma.JsonObject | null;
  if (!payload) throw new Error("Financial event payload is required for ledger projection.");

  const {
    saleId,
    saleDate,
    cashPaid,
    bankPaid,
    gPayPaid,
    remainingCredit,
    finalAmount,
  } = payload as Record<string, unknown>;

  if (typeof saleId !== "string" || !saleId.trim()) throw new Error("Sale ID is required for ledger projection.");
  if (typeof saleDate !== "string" || !saleDate.trim()) throw new Error("Sale date is required for ledger projection.");

  const cashAmount = Number(cashPaid ?? 0);
  const bankAmount = Number(bankPaid ?? 0);
  const gPayAmount = Number(gPayPaid ?? 0);
  const creditAmount = Number(remainingCredit ?? 0);
  const totalAmount = Number(finalAmount ?? 0);

  if (![cashAmount, bankAmount, gPayAmount, creditAmount, totalAmount].every(Number.isFinite)) {
    throw new Error("Ledger projection amounts must be finite numbers.");
  }

  return {
    financialEventId: input.eventId,
    correlationId: input.correlationId,
    eventType: "SALE_CREATED",
    entityType: input.entityType,
    entityId: saleId.trim(),
    entryDate: new Date(saleDate),
    cashAmount,
    bankAmount,
    gPayAmount,
    creditAmount,
    totalAmount,
  };
}

export function projectLedgerEntry(input: LedgerProjectionInput): LedgerEntryPayload | null {
  if (input.event.eventType !== "SALE_CREATED") return null;
  return assertSaleCreatedEvent(input.event);
}

export function toLedgerCreateData(payload: LedgerEntryPayload): Prisma.LedgerEntryCreateInput {
  return {
    financialEventId: payload.financialEventId,
    correlationId: payload.correlationId,
    eventType: payload.eventType,
    entityType: payload.entityType,
    entityId: payload.entityId,
    entryDate: payload.entryDate,
    cashAmount: payload.cashAmount,
    bankAmount: payload.bankAmount,
    gPayAmount: payload.gPayAmount,
    creditAmount: payload.creditAmount,
    totalAmount: payload.totalAmount,
  };
}
