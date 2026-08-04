export const SYNC_MODEL_CONFIG = {
  Vehicle: { table: "vehicles", delegate: "vehicle", timeColumn: "updated_at", timeField: "updatedAt" },
  Party: { table: "parties", delegate: "party", timeColumn: "updated_at", timeField: "updatedAt" },
  Supplier: { table: "suppliers", delegate: "supplier", timeColumn: "updated_at", timeField: "updatedAt" },
  Material: { table: "materials", delegate: "material", timeColumn: "updated_at", timeField: "updatedAt" },
  OutgoingSale: { table: "outgoing_sales", delegate: "outgoingSale", timeColumn: "updated_at", timeField: "updatedAt" },
  IncomingBoulder: { table: "incoming_boulder", delegate: "incomingBoulder", timeColumn: "updated_at", timeField: "updatedAt" },
  PartyCredit: { table: "party_credit", delegate: "partyCredit", timeColumn: "updated_at", timeField: "updatedAt" },
  PartyCollection: { table: "party_collections", delegate: "partyCollection", timeColumn: "updated_at", timeField: "updatedAt" },
  PartyLedger: { table: "party_ledger", delegate: "partyLedger", timeColumn: "created_at", timeField: "createdAt" },
  PartyPayment: { table: "party_payments", delegate: "partyPayment", timeColumn: "updated_at", timeField: "updatedAt" },
  Expense: { table: "expenses", delegate: "expense", timeColumn: "updated_at", timeField: "updatedAt" },
  EmployeeCredit: { table: "employee_credit", delegate: "employeeCredit", timeColumn: "updated_at", timeField: "updatedAt" },
  OtherCredit: { table: "other_credits", delegate: "otherCredit", timeColumn: "updated_at", timeField: "updatedAt" },
  DayBook: { table: "day_books", delegate: "dayBook", timeColumn: "updated_at", timeField: "updatedAt" },
  DayBookEntry: { table: "day_book_entries", delegate: "dayBookEntry", timeColumn: "updated_at", timeField: "updatedAt" },
  DayBookExpenseEntry: { table: "day_book_expense_entries", delegate: "dayBookExpenseEntry", timeColumn: "created_at", timeField: "createdAt" },
  Employee: { table: "employees", delegate: "employee", timeColumn: "updated_at", timeField: "updatedAt" },
  EmployeeLedger: { table: "employee_ledgers", delegate: "employeeLedger", timeColumn: "created_at", timeField: "createdAt" },
  FuelPurchase: { table: "fuel_purchases", delegate: "fuelPurchase", timeColumn: "updated_at", timeField: "updatedAt" },
  CashTransfer: { table: "cash_transfers", delegate: "cashTransfer", timeColumn: "created_at", timeField: "createdAt" },
  GlobalSettings: { table: "global_settings", delegate: "globalSettings", timeColumn: "updated_at", timeField: "updatedAt" },
  FinancialEvent: { table: "financial_events", delegate: "financialEvent", timeColumn: "created_at", timeField: "createdAt" },
  LedgerEntry: { table: "ledger_entries", delegate: "ledgerEntry", timeColumn: "created_at", timeField: "createdAt" },
  InventoryStock: { table: "inventory_stock", delegate: "inventoryStock", timeColumn: "last_updated", timeField: "lastUpdated" },
  InventoryTransaction: { table: "inventory_transactions", delegate: "inventoryTransaction", timeColumn: "created_at", timeField: "createdAt" },
} as const;

export type SyncModelName = keyof typeof SYNC_MODEL_CONFIG;

export const REMOTE_CONFLICT_COLUMNS: Partial<Record<SyncModelName, string>> = {
  LedgerEntry: "financial_event_id",
  InventoryStock: "material_name",
};

export const LOCAL_CONFLICT_FIELDS: Partial<Record<SyncModelName, string>> = {
  LedgerEntry: "financialEventId",
  InventoryStock: "materialName",
};

const AUDIT_ENTITY_ALIASES: Record<string, SyncModelName> = {
  Sale: "OutgoingSale",
};

export const PULL_ORDER: SyncModelName[] = [
  "GlobalSettings",
  "Material",
  "Party",
  "Supplier",
  "Vehicle",
  "Employee",
  "FinancialEvent",
  "LedgerEntry",
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
  "CashTransfer",
  "InventoryStock",
  "InventoryTransaction",
];

// These projection tables do not create audit rows of their own, so they must
// be scanned by timestamp during push sync.
export const DIRECT_PUSH_MODELS: SyncModelName[] = [
  "FinancialEvent",
  "LedgerEntry",
  "InventoryStock",
  "InventoryTransaction",
];

export function resolveSyncModel(entityName: string): SyncModelName | null {
  if (AUDIT_ENTITY_ALIASES[entityName]) return AUDIT_ENTITY_ALIASES[entityName];
  return entityName in SYNC_MODEL_CONFIG ? (entityName as SyncModelName) : null;
}

export function extractEntityData(rawPayload: unknown): Record<string, unknown> {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    throw new Error("Sync payload must be a JSON object.");
  }

  const payload = rawPayload as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(payload, "after")) {
    if (!payload.after || typeof payload.after !== "object" || Array.isArray(payload.after)) {
      throw new Error("Create/update audit payload is missing its entity snapshot.");
    }
    return payload.after as Record<string, unknown>;
  }

  // Backward compatibility for legacy audit rows that stored the entity directly.
  return payload;
}

export function getRowTimestamp(row: Record<string, unknown>, timeField: string): Date {
  const value = row[timeField];
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Sync row has an invalid ${timeField} timestamp.`);
  }
  return date;
}
