import type { Prisma } from "@prisma/client";

function toAuditJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function writeAudit(
  tx: Prisma.TransactionClient,
  input: {
    tableName: string;
    recordId: string;
    action: "CREATE" | "UPDATE" | "DELETE";
    userId: string;
    before?: unknown;
    after?: unknown;
    saleId?: string | null;
  },
) {
  await tx.auditLog.create({
    data: {
      tableName: input.tableName,
      recordId: input.recordId,
      action: input.action,
      userId: input.userId,
      before: toAuditJson(input.before),
      after: toAuditJson(input.after),
      saleId: input.saleId ?? undefined,
    },
  });
}
