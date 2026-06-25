import type { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import type { FinancialEventInput } from "./types";

function assertFinancialEventInput(input: FinancialEventInput) {
  if (!input.correlationId.trim()) throw new Error("Correlation ID is required.");
  if (!input.entityId.trim()) throw new Error("Entity ID is required.");
  if (!input.entityType.trim()) throw new Error("Entity type is required.");
  if (!input.eventType.trim()) throw new Error("Event type is required.");
  if (!input.payload) throw new Error("Payload is required.");
}

export async function createFinancialEvent(tx: Prisma.TransactionClient, input: FinancialEventInput) {
  assertFinancialEventInput(input);
  return tx.financialEvent.create({
    data: {
      eventId: randomUUID(),
      correlationId: input.correlationId.trim(),
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId.trim(),
      schemaVersion: input.schemaVersion ?? 1,
      payload: input.payload as Prisma.InputJsonValue,
    },
  });
}
