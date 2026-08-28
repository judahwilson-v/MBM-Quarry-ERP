"use server";

import { Prisma } from "@prisma/client";
import { serialize } from "@/lib/utils/serialize";
import { getDb } from "@/lib/prisma";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { enqueueOutboxEvent } from "@/lib/sync/outbox";
import { writeAuditEvent } from "@/lib/domain";
import { verifyEditPassword } from "@/app/actions/auth";
import { sanitizeError } from "@/lib/utils/sanitize-error";

export type VehicleInput = {
  id?: string;
  vehicleNumber: string;
  partyName?: string | null;
  companyBodyQty?: string | number | null;
  extraBodyQty?: string | number | null;
  vehicleType?: string | null;
};

function normalizeVehicleNumber(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function cleanText(value?: string | null) {
  const text = value?.trim() ?? "";
  return text || null;
}

function requiredText(value: string | null | undefined, label: string) {
  const text = value?.trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

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

async function upsertPartyByName(partyName: string) {
  const db = await getDb();
  const name = partyName.trim();
  if (!name) return;
  const existing = await db.party.findFirst({
    where: { partyName: { equals: name } },
    select: { id: true },
  });
  if (!existing) {
    return await runTx(async (tx) => {
      const row = await tx.party.create({ data: { partyName: name } });
      try {
        await writeAuditEvent(tx, { entityName: "Party", entityId: row.id, action: "create", role: "system", after: row });
      } catch (e) {
        console.warn("Failed to write audit event for party upsert:", e);
      }
      return row;
    });
  }
  return existing;
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

export async function listVehicles(search = "") {
  const db = await getDb();
  const rows = await db.vehicle.findMany({ orderBy: { vehicleNumber: "asc" } });
  return serialize(rows.filter((row) => containsSearch(row, search)));
}

export async function saveVehicle(input: VehicleInput) {
  const vehicleNumber = normalizeVehicleNumber(requiredText(input.vehicleNumber, "Vehicle number"));
  const partyName = cleanText(input.partyName);
  const companyBodyQty = parseNumber(input.companyBodyQty, "Company body qty", false);
  const extraBodyQty = parseNumber(input.extraBodyQty, "Extra body qty", false);

  if (partyName) await upsertPartyByName(partyName);

  const data = { vehicleNumber, partyName, companyBodyQty, extraBodyQty, vehicleType: cleanText(input.vehicleType) };
  if (input.id) {
    return serialize(await runTx(async (tx) => {
      const before = await tx.vehicle.findUnique({ where: { id: input.id } });
      const row = await tx.vehicle.update({ where: { id: input.id }, data });
      await writeAuditEvent(tx, { entityName: "Vehicle", entityId: row.id, action: "update", role: "system", before, after: row });
      await enqueueOutboxEvent(tx, { entityType: "Vehicle", entityId: row.id, operation: "update", payload: row });
      return row;
    }));
  }
  return serialize(await runTx(async (tx) => {
    const row = await tx.vehicle.create({ data });
    await writeAuditEvent(tx, { entityName: "Vehicle", entityId: row.id, action: "create", role: "system", after: row });
    await enqueueOutboxEvent(tx, { entityType: "Vehicle", entityId: row.id, operation: "create", payload: row });
    return row;
  }));
}

export async function deleteVehicle(id: string, pin?: string) {
  try {
    if (!pin || !(await verifyEditPassword(pin, "delete"))) {
      throw new Error("Invalid delete PIN");
    }
    await runTx(async (tx) => {
      const before = await tx.vehicle.findUnique({ where: { id } });
      if (!before) return;
      
      // Check for FK references that would cause constraint violations
      const saleCount = await tx.outgoingSale.count({ where: { vehicleId: id } });
      const boulderCount = await tx.incomingBoulder.count({ where: { vehicleId: id } });
      const fuelCount = await tx.fuelPurchase.count({ where: { vehicleId: id } });
      const total = saleCount + boulderCount + fuelCount;
      if (total > 0) {
        throw new Error(`Cannot delete vehicle "${before.vehicleNumber}" — it has ${saleCount} sale(s), ${boulderCount} boulder purchase(s), and ${fuelCount} fuel record(s). Remove those records first.`);
      }
      
      await tx.vehicle.delete({ where: { id } });
      try {
        await writeAuditEvent(tx, { entityName: "Vehicle", entityId: id, action: "delete", role: "system", before });
      } catch (e) {
        console.warn("Failed to write audit event for vehicle:", e);
      }
      await enqueueOutboxEvent(tx, { entityType: "Vehicle", entityId: id, operation: "delete", payload: before });
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: sanitizeError(error) };
  }
}
