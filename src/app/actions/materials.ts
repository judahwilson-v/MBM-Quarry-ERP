"use server";



import { Prisma } from "@prisma/client";
import { serialize } from "@/lib/utils/serialize";
import { getDb } from "@/lib/prisma";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { writeAuditEvent } from "@/lib/domain";

function parseNumber(value: string | number | null | undefined, label: string, required = true) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new Error(`${label} is required.`);
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a valid number.`);
  return number;
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


export async function listMaterials(search = "") {
  const db = await getDb();
  const rows = await db.material.findMany({ orderBy: { materialName: "asc" } });
  return serialize(rows.filter((row) => containsSearch(row, search)));
}


export async function updateMaterialRate(id: string, ratePerCft: string | number) {
  const rate = parseNumber(ratePerCft, "Rate");
  if (rate === null || rate < 0) throw new Error("Rate must be zero or greater.");
  return serialize(await runTx(async (tx) => {
    const before = await tx.material.findUnique({ where: { id } });
    const row = await tx.material.update({ where: { id }, data: { ratePerCft: rate } });
    await writeAuditEvent(tx, { entityName: "Material", entityId: row.id, action: "update", role: "system", before, after: row });
    return row;
  }));
}


