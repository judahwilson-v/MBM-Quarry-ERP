"use server";



import { Prisma } from "@prisma/client";
import { serialize } from "@/lib/utils/serialize";
import { getDb } from "@/lib/prisma";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { enqueueOutboxEvent } from "@/lib/sync/outbox";
import { writeAuditEvent } from "@/lib/domain";
import { verifyEditPassword } from "@/app/actions/auth";
import { sanitizeError } from "@/lib/utils/sanitize-error";

type PartyInput = {
  id?: string;
  partyName: string;
  phone?: string | null;
  address?: string | null;
  partyGroup?: string | null;
};

function cleanText(value?: string | null) {
  const text = value?.trim() ?? "";
  return text || null;
}

function requiredText(value: string | null | undefined, label: string) {
  const text = value?.trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function containsSearch(row: Record<string, unknown>, search?: string) {
  const query = search?.trim().toLowerCase();
  if (!query) return true;
  return Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query));
}

async function runTx<T>(txFn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const db = await getDb();
  try {
    return await db.$transaction(txFn);
  } finally {
    // Fire-and-forget: don't block the server action response with sync
    setTimeout(() => triggerAutoSync().catch(console.error), 0);
  }
}


export async function listParties(search = "") {
  const db = await getDb();
  const rows = await db.party.findMany({ orderBy: { partyName: "asc" } });
  return serialize(rows.filter((row) => containsSearch(row, search)));
}


export async function saveParty(input: PartyInput) {
  const data = {
    partyName: requiredText(input.partyName, "Party name"),
    phone: cleanText(input.phone),
    address: cleanText(input.address),
    partyGroup: cleanText(input.partyGroup),
  };
  if (input.id) {
    return serialize(await runTx(async (tx) => {
      const before = await tx.party.findUnique({ where: { id: input.id } });
      const row = await tx.party.update({ where: { id: input.id }, data });
      await writeAuditEvent(tx, { entityName: "Party", entityId: row.id, action: "update", role: "system", before, after: row });
      await enqueueOutboxEvent(tx, { entityType: "Party", entityId: row.id, operation: "update", payload: row });
      return row;
    }));
  }
  return serialize(await runTx(async (tx) => {
    const row = await tx.party.create({ data });
    await writeAuditEvent(tx, { entityName: "Party", entityId: row.id, action: "create", role: "system", after: row });
    await enqueueOutboxEvent(tx, { entityType: "Party", entityId: row.id, operation: "create", payload: row });
    return row;
  }));
}


export async function deleteParty(id: string, pin?: string) {
  try {
    if (!pin || !(await verifyEditPassword(pin, "delete"))) {
      throw new Error("Invalid delete PIN");
    }
    await runTx(async (tx) => {
      const before = await tx.party.findUnique({ where: { id } });
      if (!before) return;
      
      // Check for FK references that would cause constraint violations
      const saleCount = await tx.outgoingSale.count({ where: { partyId: id } });
      const boulderCount = await tx.incomingBoulder.count({ where: { partyId: id } });
      const collectionCount = await tx.partyCollection.count({ where: { partyId: id } });
      const paymentCount = await tx.partyPayment.count({ where: { partyId: id } });
      const total = saleCount + boulderCount + collectionCount + paymentCount;
      if (total > 0) {
        throw new Error(`Cannot delete party "${before.partyName}" — it has ${saleCount} sale(s), ${boulderCount} boulder purchase(s), ${collectionCount} collection(s), and ${paymentCount} payment(s). Remove those records first.`);
      }
      
      await tx.party.delete({ where: { id } });
      try {
        await writeAuditEvent(tx, { entityName: "Party", entityId: id, action: "delete", role: "system", before });
      } catch (e) {
        console.warn("Failed to write audit event for party:", e);
      }
      await enqueueOutboxEvent(tx, { entityType: "Party", entityId: id, operation: "delete", payload: before });
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: sanitizeError(error) };
  }
}


