import type { Prisma } from "@prisma/client";
import { projectLedgerEntry, toLedgerCreateData } from "./projector";

type FinancialEventRecord = {
  eventId: string;
  correlationId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  createdAt: Date;
  payload: Prisma.JsonValue;
};

export async function projectLedgerFromFinancialEvent(
  tx: Prisma.TransactionClient,
  event: FinancialEventRecord,
) {
  const existing = await tx.ledgerEntry.findUnique({
    where: { financialEventId: event.eventId },
  });
  if (existing) return existing;

  const projected = projectLedgerEntry({ event });
  if (!projected) return null;
  return tx.ledgerEntry.upsert({
    where: { financialEventId: projected.financialEventId },
    update: toLedgerCreateData(projected),
    create: toLedgerCreateData(projected),
  });
}

export async function rebuildLedger(tx: Prisma.TransactionClient) {
  const events = await tx.financialEvent.findMany({
    orderBy: [{ createdAt: "asc" }, { eventId: "asc" }],
  });

  await tx.ledgerEntry.deleteMany({});

  for (const event of events) {
    await projectLedgerFromFinancialEvent(tx, event);
  }

  return events.length;
}
