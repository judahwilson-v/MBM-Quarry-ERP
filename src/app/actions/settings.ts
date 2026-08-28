"use server";

import { getDb } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { writeAuditEvent } from "@/lib/domain";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { enqueueOutboxEvent } from "@/lib/sync/outbox";
import { sanitizeError } from "@/lib/utils/sanitize-error";

export async function getGlobalSettings() {
  const prisma = await getDb();
  let settings = await prisma.globalSettings.findUnique({
    where: { id: "default" }
  });

  if (!settings) {
    try {
      settings = await prisma.$transaction(async (tx) => {
        const row = await tx.globalSettings.create({ data: { id: "default" } });
        await writeAuditEvent(tx, {
          entityName: "GlobalSettings",
          entityId: row.id,
          action: "create",
          role: "system",
          after: row,
        });
        await enqueueOutboxEvent(tx, {
          entityType: "GlobalSettings",
          entityId: row.id,
          operation: "create",
          payload: row,
        });
        return row;
      });
    } catch {
      // Fallback for read-only environments (e.g. Vercel dashboard)
      settings = {
        id: "default",
        quarryName: "MBM Quarry",
        adminPin: "8888",
        deletePin: "7711",
        enableCreditLocks: false,
      } as any;
    }
  }

  return settings!;
}



export async function updateGlobalSettings(data: any) {
  try {
    const prisma = await getDb();
    const settings = await prisma.$transaction(async (tx) => {
      const before = await tx.globalSettings.findUnique({ where: { id: "default" } });
      const row = await tx.globalSettings.upsert({
        where: { id: "default" },
        update: {
        quarryName: data.quarryName,
        gstNumber: data.gstNumber,
        address: data.address,
        phone: data.phone,
        defaultPrinter: data.defaultPrinter,
        backupFolder: data.backupFolder,
        adminPin: data.adminPin,
        deletePin: data.deletePin,
        enableWeighbridge: data.enableWeighbridge ?? before?.enableWeighbridge ?? false,
        enableFleetMaintenance: data.enableFleetMaintenance ?? before?.enableFleetMaintenance ?? false,
        enableCustomerPortal: data.enableCustomerPortal ?? before?.enableCustomerPortal ?? false,
        enableCreditLocks: data.enableCreditLocks ?? before?.enableCreditLocks ?? false,
      },
        create: {
        id: "default",
        quarryName: data.quarryName || "MBM Quarry",
        gstNumber: data.gstNumber || "",
        address: data.address || "",
        phone: data.phone || "",
        defaultPrinter: data.defaultPrinter || "",
        backupFolder: data.backupFolder || "",
        adminPin: data.adminPin || "8888",
        deletePin: data.deletePin || "7711",
        enableWeighbridge: data.enableWeighbridge ?? false,
        enableFleetMaintenance: data.enableFleetMaintenance ?? false,
        enableCustomerPortal: data.enableCustomerPortal ?? false,
        enableCreditLocks: data.enableCreditLocks ?? false,
        }
      });
      await writeAuditEvent(tx, {
        entityName: "GlobalSettings",
        entityId: row.id,
        action: before ? "update" : "create",
        role: "system",
        before,
        after: row,
      });
      await enqueueOutboxEvent(tx, {
        entityType: "GlobalSettings",
        entityId: row.id,
        operation: before ? "update" : "create",
        payload: row,
      });
      return row;
    });
    // Fire-and-forget: don't block the server action response with sync
    setTimeout(() => triggerAutoSync().catch(console.error), 0);
    revalidatePath("/settings");
    revalidatePath("/");
    return { success: true, settings };
  } catch (error: any) {
    return { success: false, message: sanitizeError(error) };
  }
}
