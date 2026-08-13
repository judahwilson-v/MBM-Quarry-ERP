"use server";



import { Prisma } from "@prisma/client";
import { serialize } from "@/lib/utils/serialize";
import { getDb } from "@/lib/prisma";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { writeAuditEvent } from "@/lib/domain";

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
      return row;
    }));
  }
  return serialize(await runTx(async (tx) => {
    const row = await tx.party.create({ data });
    await writeAuditEvent(tx, { entityName: "Party", entityId: row.id, action: "create", role: "system", after: row });
    return row;
  }));
}


export async function deleteParty(id: string) {
  await runTx(async (tx) => {
    const before = await tx.party.findUnique({ where: { id } });
    await tx.party.delete({ where: { id } });
    if (before) await writeAuditEvent(tx, { entityName: "Party", entityId: id, action: "delete", role: "system", before });
  });
}


