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
  WeighbridgeTicket: { table: "weighbridge_tickets", delegate: "weighbridgeTicket", timeColumn: "updated_at", timeField: "updatedAt" },
  MaintenanceRecord: { table: "maintenance_records", delegate: "maintenanceRecord", timeColumn: "updated_at", timeField: "updatedAt" },
  MaintenanceSchedule: { table: "maintenance_schedules", delegate: "maintenanceSchedule", timeColumn: "updated_at", timeField: "updatedAt" },
  VehicleStats: { table: "vehicle_stats", delegate: "vehicleStats", timeColumn: "updated_at", timeField: "updatedAt" },
} as const;

export type SyncModelName = keyof typeof SYNC_MODEL_CONFIG;

export const PUSH_PRIORITY: Record<SyncModelName, number> = {
  GlobalSettings: 1,
  Material: 2,
  Party: 3,
  Supplier: 4,
  Employee: 5,
  FinancialEvent: 6,
  DayBook: 7,
  DayBookEntry: 8,
  EmployeeCredit: 9,
  OtherCredit: 10,
  CashTransfer: 11,
  InventoryStock: 12,
  Vehicle: 13,
  LedgerEntry: 14,
  DayBookExpenseEntry: 15,
  EmployeeLedger: 16,
  InventoryTransaction: 17,
  PartyCollection: 18,
  PartyPayment: 19,
  PartyLedger: 20,
  OutgoingSale: 21,
  IncomingBoulder: 22,
  Expense: 23,
  FuelPurchase: 24,
  MaintenanceRecord: 25,
  MaintenanceSchedule: 26,
  VehicleStats: 27,
  PartyCredit: 28,
  WeighbridgeTicket: 29,
};

export const REMOTE_CONFLICT_COLUMNS: Record<SyncModelName, string> = {
  GlobalSettings: "id",
  Material: "material_name",
  Party: "party_name",
  Supplier: "supplier_name",
  Employee: "name",
  FinancialEvent: "event_id",
  DayBook: "business_date",
  DayBookEntry: "id",
  EmployeeCredit: "id",
  OtherCredit: "id",
  CashTransfer: "id",
  InventoryStock: "material_name",
  Vehicle: "vehicle_number",
  LedgerEntry: "financial_event_id",
  DayBookExpenseEntry: "source_event_id",
  EmployeeLedger: "id",
  InventoryTransaction: "id",
  PartyCollection: "source_event_id",
  PartyPayment: "source_event_id",
  PartyLedger: "id",
  OutgoingSale: "serial_number",
  IncomingBoulder: "id",
  Expense: "source_event_id",
  FuelPurchase: "source_event_id",
  MaintenanceRecord: "id",
  MaintenanceSchedule: "id",
  VehicleStats: "vehicle_id",
  PartyCredit: "id",
  WeighbridgeTicket: "ticket_number",
};

export const LOCAL_CONFLICT_FIELDS: Record<SyncModelName, string> = {
  GlobalSettings: "id",
  Material: "materialName",
  Party: "partyName",
  Supplier: "supplierName",
  Employee: "name",
  FinancialEvent: "eventId",
  DayBook: "businessDate",
  DayBookEntry: "id",
  EmployeeCredit: "id",
  OtherCredit: "id",
  CashTransfer: "id",
  InventoryStock: "materialName",
  Vehicle: "vehicleNumber",
  LedgerEntry: "financialEventId",
  DayBookExpenseEntry: "sourceEventId",
  EmployeeLedger: "id",
  InventoryTransaction: "id",
  PartyCollection: "sourceEventId",
  PartyPayment: "sourceEventId",
  PartyLedger: "id",
  OutgoingSale: "serialNumber",
  IncomingBoulder: "id",
  Expense: "sourceEventId",
  FuelPurchase: "sourceEventId",
  MaintenanceRecord: "id",
  MaintenanceSchedule: "id",
  VehicleStats: "vehicleId",
  PartyCredit: "id",
  WeighbridgeTicket: "ticketNumber",
};

const AUDIT_ENTITY_ALIASES: Record<string, SyncModelName> = {
  Sale: "OutgoingSale",
};

// Reverse lookup: given a SyncModelName, find all audit entity names that alias to it
export const AUDIT_ENTITY_ALIASES_REVERSE: Record<string, string[]> = {};
for (const [alias, modelName] of Object.entries(AUDIT_ENTITY_ALIASES)) {
  if (!AUDIT_ENTITY_ALIASES_REVERSE[modelName]) {
    AUDIT_ENTITY_ALIASES_REVERSE[modelName] = [];
  }
  AUDIT_ENTITY_ALIASES_REVERSE[modelName].push(alias);
}

export const PULL_ORDER: SyncModelName[] = [
  "GlobalSettings",
  "Material",
  "Party",
  "Supplier",
  "Employee",
  "FinancialEvent",
  "DayBook",
  "DayBookEntry",
  "EmployeeCredit",
  "OtherCredit",
  "CashTransfer",
  "InventoryStock",
  "Vehicle",
  "LedgerEntry",
  "DayBookExpenseEntry",
  "EmployeeLedger",
  "InventoryTransaction",
  "PartyCollection",
  "PartyPayment",
  "PartyLedger",
  "OutgoingSale",
  "IncomingBoulder",
  "Expense",
  "FuelPurchase",
  "MaintenanceRecord",
  "MaintenanceSchedule",
  "VehicleStats",
  "PartyCredit",
  "WeighbridgeTicket",
];

// All tables are scanned by timestamp during push sync as a reliable fallback.
// This ensures data is pushed even if audit logs are missed, skipped, or the
// sync cursor advances past them due to FK errors or other transient failures.
export const DIRECT_PUSH_MODELS: SyncModelName[] = [
  "GlobalSettings",
  "Material",
  "Party",
  "Supplier",
  "Employee",
  "FinancialEvent",
  "DayBook",
  "DayBookEntry",
  "EmployeeCredit",
  "OtherCredit",
  "CashTransfer",
  "InventoryStock",
  "Vehicle",
  "LedgerEntry",
  "DayBookExpenseEntry",
  "EmployeeLedger",
  "InventoryTransaction",
  "PartyCollection",
  "PartyPayment",
  "PartyLedger",
  "OutgoingSale",
  "IncomingBoulder",
  "Expense",
  "FuelPurchase",
  "MaintenanceRecord",
  "MaintenanceSchedule",
  "VehicleStats",
  "PartyCredit",
  "WeighbridgeTicket",
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
