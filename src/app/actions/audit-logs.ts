"use server";

import { getDb } from "@/lib/prisma";

export async function fetchAuditLogs(filters?: {
  dateFrom?: string;
  dateTo?: string;
  entityName?: string;
}) {
  const db = await getDb();

  const where: any = {};

  if (filters?.dateFrom || filters?.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) {
      const end = new Date(filters.dateTo);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  if (filters?.entityName) {
    where.entityName = filters.entityName;
  }

  const logs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return logs.map((log) => ({
    ...log,
    createdAt: log.createdAt.toISOString(),
  }));
}

export async function fetchAuditLogEntityNames() {
  const db = await getDb();
  const results = await db.auditLog.groupBy({
    by: ["entityName"],
    orderBy: { entityName: "asc" },
  });
  return results.map((r) => r.entityName);
}
