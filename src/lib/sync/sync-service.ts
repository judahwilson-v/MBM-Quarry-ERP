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

// Dependency order for safe foreign key insertion
const PULL_ORDER = [
  "GlobalSettings",
  "Material",
  "Party",
  "Vehicle",
  "Employee",
  "OutgoingSale",
  "IncomingBoulder",
  "PartyCredit",
  "PartyCollection",
  "PartyLedger",
  "PartyPayment",
  "EmployeeCredit",
  "OtherCredit",
  "Expense",
  "DayBook",
  "DayBookEntry",
  "DayBookExpenseEntry",
  "EmployeeLedger",
  "FuelPurchase",
  "CashTransfer"
];

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

// Convert snake_case to camelCase for Prisma
function toCamelCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map((v) => toCamelCase(v));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      result[camelKey] = toCamelCase(obj[key]);
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
      
      if (tableName) {
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
      }
      
      // Push the audit log itself to Supabase so other PCs know about deletions
      const { error: auditError } = await supabase.from("audit_logs").upsert(toSnakeCase(log));
      if (auditError) throw auditError;

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
    // Stop syncing on first error to maintain ordering
  }

  return { pushed: successCount };
}

export async function pullSync() {
  const db = await getDb();
  
  // 1. Get pull state
  let pullState = await db.syncState.findUnique({ where: { id: "pull_state" } });
  if (!pullState) {
    pullState = await db.syncState.create({
      data: { id: "pull_state", lastSyncedAt: new Date(0) }
    });
  }

  let lastProcessedTime = pullState.lastSyncedAt;
  let successCount = 0;

  await db.syncState.update({ where: { id: "pull_state" }, data: { status: "SYNCING" } });

  try {
    // 2. Fetch deletions from audit_logs
    const { data: deleteLogs, error: deleteError } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('action', 'delete')
      .gt('created_at', pullState.lastSyncedAt.toISOString())
      .order('created_at', { ascending: true });

    if (deleteError) throw deleteError;

    if (deleteLogs && deleteLogs.length > 0) {
      for (const log of deleteLogs) {
        const camelLog = toCamelCase(log);
        const prismaModel = camelLog.entityName;
        if ((db as any)[prismaModel]) {
           try {
             await (db as any)[prismaModel].delete({ where: { id: camelLog.entityId } });
             successCount++;
           } catch (err) {
             // If already deleted or missing, ignore
           }
        }
        const logDate = new Date(camelLog.createdAt);
        if (logDate > lastProcessedTime) lastProcessedTime = logDate;
      }
    }

    // 3. Fetch creations/updates from actual tables
    for (const prismaModel of PULL_ORDER) {
      const tableName = TABLE_MAP[prismaModel];
      if (!tableName) continue;

      const { data: rows, error: rowsError } = await supabase
        .from(tableName)
        .select('*')
        .gt('updated_at', pullState.lastSyncedAt.toISOString())
        .order('updated_at', { ascending: true });

      if (rowsError) throw rowsError;

      if (rows && rows.length > 0) {
        for (const row of rows) {
           const camelRow = toCamelCase(row);
           try {
             await (db as any)[prismaModel].upsert({
               where: { id: camelRow.id },
               update: camelRow,
               create: camelRow
             });
             successCount++;
           } catch(e) {
             console.error(`Failed to upsert ${prismaModel} ${camelRow.id}`, e);
           }
           
           const rowDate = new Date(camelRow.updatedAt);
           if (rowDate > lastProcessedTime) lastProcessedTime = rowDate;
        }
      }
    }

    await db.syncState.update({
      where: { id: "pull_state" },
      data: { lastSyncedAt: lastProcessedTime, status: "IDLE", lastError: null }
    });

  } catch (e: any) {
    console.error(`Pull sync error:`, e);
    await db.syncState.update({
      where: { id: "pull_state" },
      data: { status: "ERROR", lastError: e.message || "Unknown pull error" }
    });
  }

  return { pulled: successCount };
}

export async function getSyncStatus() {
  const db = await getDb();
  const pushState = await db.syncState.findUnique({ where: { id: "default" } });
  const pullState = await db.syncState.findUnique({ where: { id: "pull_state" } });
  
  const pendingCount = await db.auditLog.count({
    where: { createdAt: { gt: pushState?.lastSyncedAt || new Date(0) } }
  });

  return {
    lastSyncedAt: pushState?.lastSyncedAt || null,
    lastPulledAt: pullState?.lastSyncedAt || null,
    status: pushState?.status === "ERROR" || pullState?.status === "ERROR" ? "ERROR" : 
            pushState?.status === "SYNCING" || pullState?.status === "SYNCING" ? "SYNCING" : "IDLE",
    pendingCount
  };
}
