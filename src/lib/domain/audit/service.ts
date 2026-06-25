import type { Prisma, PrismaClient } from "@prisma/client";

type AuditInput = {
  entityName: string;
  entityId: string;
  action: "create" | "update" | "delete";
  role?: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

type AuditClient = Pick<PrismaClient, "auditLog"> | Prisma.TransactionClient;

export async function writeAuditEvent(db: AuditClient, input: AuditInput) {
  await db.auditLog.create({
    data: {
      entityName: input.entityName,
      entityId: input.entityId,
      action: input.action,
      payload: JSON.stringify({
        role: input.role ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
        reason: input.reason ?? null,
      }),
    },
  });
}
