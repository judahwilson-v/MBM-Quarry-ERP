import { getDb } from "@/lib/prisma";
import { supabase } from "@/lib/supabase/client";

// Mappings for Prisma model names to Supabase table names
const TABLE_MAP: Record<string, string> = {
  Vehicle: "vehicles",
  Party: "parties",
  Material: "materials",
  OutgoingSale: "outgoing_sales",
  IncomingBoulder: "incoming_boulder",
  PartyCredit: "party_credit",
  PartyCollection: "party_collections",
  PartyLedger: "party_ledger",
  PartyPayment: "party_payments",
  Expense: "expenses",
  EmployeeCredit: "employee_credit",
  OtherCredit: "other_credits",
  DayBook: "day_books",
  DayBookEntry: "day_book_entries",
  DayBookExpenseEntry: "day_book_expense_entries",
  Employee: "employees",
  EmployeeLedger: "employee_ledgers",
  FuelPurchase: "fuel_purchases",
  CashTransfer: "cash_transfers",
  GlobalSettings: "global_settings"
};

// Convert camelCase object keys to snake_case for Supabase REST API
function toSnakeCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map((v) => toSnakeCase(v));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      result[snakeKey] = toSnakeCase(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
}

export async function pushSync() {
  const db = await getDb();
  
  // 1. Get sync state
  let syncState = await db.syncState.findUnique({ where: { id: "default" } });
  if (!syncState) {
    syncState = await db.syncState.create({
      data: { id: "default", lastSyncedAt: new Date(0) }
    });
  }

  // 2. Fetch new audit logs since last sync
  const unsyncedLogs = await db.auditLog.findMany({
    where: { createdAt: { gt: syncState.lastSyncedAt } },
    orderBy: { createdAt: 'asc' }
  });

  if (unsyncedLogs.length === 0) return { pushed: 0 };

  let lastProcessedTime = syncState.lastSyncedAt;
  let successCount = 0;

  await db.syncState.update({ where: { id: "default" }, data: { status: "SYNCING" } });

  try {
    for (const log of unsyncedLogs) {
      const tableName = TABLE_MAP[log.entityName];
      if (!tableName) {
        lastProcessedTime = log.createdAt;
        continue;
      }

      if (log.action === "delete") {
        const { error } = await supabase.from(tableName).delete().eq("id", log.entityId);
        if (error) throw error;
      } else {
        if (log.payload) {
          const rawData = JSON.parse(log.payload);
          const snakeData = toSnakeCase(rawData);
          const { error } = await supabase.from(tableName).upsert(snakeData);
          if (error) throw error;
        }
      }
      
      lastProcessedTime = log.createdAt;
      successCount++;
    }

    await db.syncState.update({
      where: { id: "default" },
      data: { lastSyncedAt: lastProcessedTime, status: "IDLE", lastError: null }
    });

  } catch (e: any) {
    console.error(`Sync error on log:`, e);
    await db.syncState.update({
      where: { id: "default" },
      data: { status: "ERROR", lastError: e.message || "Unknown sync error" }
    });
    // Stop syncing on first error to maintain ordering. The next sync will resume from lastProcessedTime.
  }

  return { pushed: successCount };
}

export async function pullSync() {
   // Pull logic implementation requires a strategy for fetching remote changes
   // Because Supabase is the central hub, we would query `updated_at` on all tables
   // For now, Push is the primary driver from the local SQLite source-of-truth.
   return { pulled: 0 };
}

export async function getSyncStatus() {
  const db = await getDb();
  const syncState = await db.syncState.findUnique({ where: { id: "default" } });
  
  const pendingCount = await db.auditLog.count({
    where: { createdAt: { gt: syncState?.lastSyncedAt || new Date(0) } }
  });

  return {
    lastSyncedAt: syncState?.lastSyncedAt || null,
    status: syncState?.status || "IDLE",
    pendingCount
  };
}
