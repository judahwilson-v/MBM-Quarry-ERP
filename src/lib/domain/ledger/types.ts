import type { Prisma } from "@prisma/client";

export type LedgerProjectableEventType = "SALE_CREATED";

export type LedgerEntryPayload = {
  financialEventId: string;
  correlationId: string;
  eventType: LedgerProjectableEventType;
  entityType: string;
  entityId: string;
  entryDate: Date;
  cashAmount: number;
  bankAmount: number;
  gPayAmount: number;
  creditAmount: number;
  totalAmount: number;
};

export type LedgerProjectionInput = {
  event: {
    eventId: string;
    correlationId: string;
    eventType: string;
    entityType: string;
    entityId: string;
    createdAt: Date;
    payload: Prisma.JsonValue;
  };
};
