"use server";

import { getDb } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getGlobalSettings() {
  const prisma = await getDb();
  let settings = await prisma.globalSettings.findUnique({
    where: { id: "default" }
  });

  if (!settings) {
    settings = await prisma.globalSettings.create({
      data: {
        id: "default"
      }
    });
  }

  return settings;
}

export async function updateGlobalSettings(data: any) {
  try {
    const prisma = await getDb();
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
        deletePin: data.deletePin
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
        deletePin: data.deletePin || "7711"
      }
    });
    revalidatePath("/settings");
    revalidatePath("/");
    return { success: true, settings };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}
