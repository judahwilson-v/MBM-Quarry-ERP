"use server";

import { isIdentitySetupCompatibilityMode } from "@/lib/identity/service";
import { getDb } from "@/lib/prisma";
import { stripCredentialFields as stripPins } from "@/lib/settings/internal";
import { revalidatePath } from "next/cache";
import { writeAuditEvent } from "@/lib/domain";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { enqueueOutboxEvent } from "@/lib/sync/outbox";
import { sanitizeError } from "@/lib/utils/sanitize-error";
import { verifyEditPassword, requirePrivilegedActor, isEnrollmentComplete } from "@/app/actions/auth";

import { getSettingsWithSecrets, stripCredentialFields as publicStrip } from "@/lib/settings/internal";

// Client-safe settings: the same row MINUS legacy credential fields. This is
// the only settings read client components and pages may use.
export async function getPublicSettings() {
  // getSettingsWithSecrets always yields a row (created on first use).
  return publicStrip(await getSettingsWithSecrets())!;
}

// Outbound settings snapshots omit legacy PIN fields. This does not remove
// existing local/remote/history copies or make settings reads/backup safe.
// See the candidate credential-flow trace and rollout exclusions.
export async function updateGlobalSettings(data: any, pin?: string, sessionToken?: string) {
  try {
    const prisma = await getDb();
    // Prototype control-plane guard, before transaction work. Enrollment and
    // existing settings require an owner-authorized principal plus admin PIN;
    // there is no principal-configuration action in this candidate.
    const existingSettings = await prisma.globalSettings.findUnique({ where: { id: "default" } });
    let actorName = "system";
    if (existingSettings || await isEnrollmentComplete()) {
      // Privileged control: a server-validated session AND the current admin
      // PIN. The shared PIN alone, or a login alone, is not enough.
      const actor = await requirePrivilegedActor(sessionToken);
      if (!actor) throw new Error("A valid login session is required to change settings.");
      if (!pin || !(await verifyEditPassword(pin))) {
        throw new Error("Admin PIN is required to change settings.");
      }
      actorName = actor.name;
    } else if (!isIdentitySetupCompatibilityMode()) {
      throw new Error("Owner-authorized setup is not configured in this build.");
    }
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
      // Omit credentials, rather than redaction placeholders which legacy
      // entity replay could incorrectly write into remote settings columns.
      await writeAuditEvent(tx, {
        entityName: "GlobalSettings",
        entityId: row.id,
        action: before ? "update" : "create",
        role: actorName,
        before: stripPins(before),
        after: stripPins(row),
      });
      await enqueueOutboxEvent(tx, {
        entityType: "GlobalSettings",
        entityId: row.id,
        operation: before ? "update" : "create",
        payload: stripPins(row),
      });
      return row;
    });
    // Fire-and-forget: don't block the server action response with sync
    setTimeout(() => triggerAutoSync().catch(console.error), 0);
    revalidatePath("/settings");
    revalidatePath("/");
    return { success: true, settings: stripPins(settings) };
  } catch (error: any) {
    return { success: false, message: sanitizeError(error) };
  }
}
