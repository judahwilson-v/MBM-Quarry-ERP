// Server-only settings access. This module is deliberately NOT a "use server"
// actions module: nothing exported here becomes a client-callable Server
// Action. The raw row includes legacy shared PINs and must never cross to the
// client; client-facing code uses getPublicSettings from the actions module.
import { getDb } from "@/lib/prisma";
import { writeAuditEvent } from "@/lib/domain";
import { enqueueOutboxEvent } from "@/lib/sync/outbox";

export function stripCredentialFields<T extends Record<string, any>>(row: T | null): T | null {
  if (!row) return row;
  const { adminPin, deletePin, ...rest } = row as any;
  return rest as T;
}

export async function getSettingsWithSecrets() {
  const prisma = await getDb();
  let settings = await prisma.globalSettings.findUnique({ where: { id: "default" } });
  if (!settings) {
    try {
      settings = await prisma.$transaction(async (tx) => {
        const row = await tx.globalSettings.create({ data: { id: "default" } });
        await writeAuditEvent(tx, {
          entityName: "GlobalSettings",
          entityId: row.id,
          action: "create",
          role: "system",
          after: stripCredentialFields(row),
        });
        await enqueueOutboxEvent(tx, {
          entityType: "GlobalSettings",
          entityId: row.id,
          operation: "create",
          payload: stripCredentialFields(row),
        });
        return row;
      });
    } catch {
      // Fallback for read-only environments (e.g. hosted dashboard preview).
      settings = { id: "default", quarryName: "MBM Quarry", enableCreditLocks: false } as any;
    }
  }
  return settings!;
}
