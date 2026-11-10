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

  // FULL73R: an event that a later correction event supersedes (by its
  // payload's supersedesEventId marker) must NEVER be projected, regardless
  // of createdAt ties or replay/sync order. The marker - not any clock or
  // insertion order - decides which revision is current.
  const siblings = await tx.financialEvent.findMany({
    where: { entityId: event.entityId, eventType: event.eventType },
  });
  const supersededBy = siblings.find(
    (e: FinancialEventRecord) =>
      e.eventId !== event.eventId &&
      (e.payload as Record<string, unknown> | null)?.supersedesEventId === event.eventId,
  );
  if (supersededBy) return null;

  const projected = projectLedgerEntry({ event });
  if (!projected) return null;
  const entry = await tx.ledgerEntry.upsert({
    where: { financialEventId: projected.financialEventId },
    update: toLedgerCreateData(projected),
    create: toLedgerCreateData(projected),
  });
  // FULL73: an approved sale correction APPENDS a new SALE_CREATED event (the
  // event log is immutable history; the original event is never rewritten).
  // Its ledger projection supersedes earlier projections for the same entity:
  // LedgerEntry is a rebuildable projection, not history, and the Day Book
  // sums exactly one row per sale. FULL73R: supersession is decided by the
  // payload supersedesEventId marker (see the guard above), so equal
  // createdAt timestamps or replay/sync order can never resurrect an old
  // revision; the row cleanup below stays as defence in depth.
  await tx.ledgerEntry.deleteMany({
    where: { entityId: event.entityId, eventType: event.eventType, financialEventId: { not: event.eventId } },
  });
  return entry;
}

export async function rebuildLedger(tx: Prisma.TransactionClient) {
  // FULL73R2 bound: the apply path (change-requests.ts) writes only linear
  // supersession chains - each correction names the single unsuperseded head
  // it replaces, and a forked history is refused, not extended. For a linear
  // chain this replay order is irrelevant: every superseded event is skipped
  // by its marker, so exactly the head projects. A fork can therefore only
  // exist in data written before the guard; then replay stays deterministic
  // ((createdAt, eventId) ascending, last projection stands) and the sale's
  // next correction is refused until the history is repaired - a loud,
  // bounded state, never a silent guess.
  const events = await tx.financialEvent.findMany({
    orderBy: [{ createdAt: "asc" }, { eventId: "asc" }],
  });

  await tx.ledgerEntry.deleteMany({});

  for (const event of events) {
    await projectLedgerFromFinancialEvent(tx, event);
  }

  return events.length;
}
