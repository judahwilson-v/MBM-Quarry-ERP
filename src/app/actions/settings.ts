"use server";

import { getDb } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { writeAuditEvent } from "@/lib/domain";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { sanitizeError } from "@/lib/utils/sanitize-error";

export async function getGlobalSettings() {
  const prisma = await getDb();
  let settings = await prisma.globalSettings.findUnique({
    where: { id: "default" }
  });

  if (!settings) {
    try {
      settings = await prisma.globalSettings.create({
        data: { id: "default" }
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
    const before = await prisma.globalSettings.findUnique({ where: { id: "default" } });
    const settings = await prisma.globalSettings.upsert({
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
    await writeAuditEvent(prisma, {
      entityName: "GlobalSettings",
      entityId: settings.id,
      action: before ? "update" : "create",
      role: "system",
      before,
      after: settings,
    });
    triggerAutoSync().catch(console.error);
    revalidatePath("/settings");
    revalidatePath("/");
    return { success: true, settings };
  } catch (error: any) {
    return { success: false, message: sanitizeError(error) };
  }
}
