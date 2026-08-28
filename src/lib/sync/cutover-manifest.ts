import { SYNC_MODEL_CONFIG, type SyncModelName } from "./sync-config";

export type OutboxMigrationStatus = "MIGRATED" | "DEFERRED" | "PENDING_MIGRATION";

export type CloudProjectionMethod = 
  | "apply_outbox_event"
  | "legacy_push_upsert"
  | "none";

export type CallSiteClassification = 
  | "RETAIN"
  | "SHADOW_ONLY"
  | "MIGRATE_TO_OUTBOX"
  | "RETAIN_STAGED"
  | "DISABLE"
  | "RETIRE_UNSAFE";

export interface ModelCutoverEntry {
  modelName: SyncModelName;
  tableName: string;
  outboxStatus: OutboxMigrationStatus;
  mutationEntryPoints: string[];
  cloudProjectionMethod: CloudProjectionMethod;
  conflictPolicy: string;
  evidence: string;
  cutoverReady: boolean;
}

export interface LegacyCallSiteEntry {
  name: string;
  file: string;
  callers: string[];
  classification: CallSiteClassification;
  rationale: string;
}

export const CUTOVER_MODEL_MANIFEST: Record<SyncModelName, ModelCutoverEntry> = {
  Party: {
    modelName: "Party",
    tableName: SYNC_MODEL_CONFIG.Party.table,
    outboxStatus: "MIGRATED",
    mutationEntryPoints: ["src/app/actions/parties.ts:saveParty", "src/app/actions/parties.ts:deleteParty"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert_party_name_update",
    evidence: "Phase 4 verification suite (scripts/test-phase4-outbox.ts)",
    cutoverReady: true,
  },
  Material: {
    modelName: "Material",
    tableName: SYNC_MODEL_CONFIG.Material.table,
    outboxStatus: "MIGRATED",
    mutationEntryPoints: ["src/app/actions/materials.ts:updateMaterialRate"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert_material_name_unique",
    evidence: "Phase 5 CP2 verification suite (scripts/test-phase5-outbox.ts)",
    cutoverReady: true,
  },
  Employee: {
    modelName: "Employee",
    tableName: SYNC_MODEL_CONFIG.Employee.table,
    outboxStatus: "MIGRATED",
    mutationEntryPoints: ["src/app/actions/employees.ts:saveEmployee", "src/app/actions/employees.ts:deleteEmployee"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert_name_unique",
    evidence: "Phase 5 CP3 verification suite (scripts/test-phase5-outbox.ts)",
    cutoverReady: true,
  },
  GlobalSettings: {
    modelName: "GlobalSettings",
    tableName: SYNC_MODEL_CONFIG.GlobalSettings.table,
    outboxStatus: "MIGRATED",
    mutationEntryPoints: ["src/app/actions/settings.ts:updateGlobalSettings", "src/app/actions/settings.ts:getGlobalSettings"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "singleton_id_default_upsert",
    evidence: "Phase 5 CP3 verification suite (scripts/test-phase5-outbox.ts)",
    cutoverReady: true,
  },
  Vehicle: {
    modelName: "Vehicle",
    tableName: SYNC_MODEL_CONFIG.Vehicle.table,
    outboxStatus: "MIGRATED",
    mutationEntryPoints: ["src/app/actions/vehicles.ts:saveVehicle", "src/app/actions/vehicles.ts:deleteVehicle"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert_vehicle_number_unique",
    evidence: "Phase 5 CP4 verification suite (scripts/test-phase5-outbox.ts)",
    cutoverReady: true,
  },
  Supplier: {
    modelName: "Supplier",
    tableName: SYNC_MODEL_CONFIG.Supplier.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: [],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert_supplier_name_unique",
    evidence: "Documented in Phase 5 CP3: no mutation action in repo",
    cutoverReady: false,
  },
  FinancialEvent: {
    modelName: "FinancialEvent",
    tableName: SYNC_MODEL_CONFIG.FinancialEvent.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/lib/domain/financial-events/emitter.ts:emitFinancialEvent"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert_event_id_unique_immutable",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  LedgerEntry: {
    modelName: "LedgerEntry",
    tableName: SYNC_MODEL_CONFIG.LedgerEntry.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/lib/domain/financial-events/emitter.ts:emitFinancialEvent"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert_financial_event_id_unique",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  DayBook: {
    modelName: "DayBook",
    tableName: SYNC_MODEL_CONFIG.DayBook.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/lib/domain/daybook/service.ts:getOrCreateDayBook", "src/lib/domain/daybook/service.ts:recalculateDayBook"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert_business_date_unique",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  DayBookEntry: {
    modelName: "DayBookEntry",
    tableName: SYNC_MODEL_CONFIG.DayBookEntry.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/app/actions/daybook_offline.ts"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  DayBookExpenseEntry: {
    modelName: "DayBookExpenseEntry",
    tableName: SYNC_MODEL_CONFIG.DayBookExpenseEntry.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/app/actions/expenses.ts", "src/app/actions/employees.ts"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert_source_event_id_unique",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  EmployeeCredit: {
    modelName: "EmployeeCredit",
    tableName: SYNC_MODEL_CONFIG.EmployeeCredit.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/app/actions/employees.ts:saveEmployeeCredit", "src/app/actions/employees.ts:deleteEmployeeCredit"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  OtherCredit: {
    modelName: "OtherCredit",
    tableName: SYNC_MODEL_CONFIG.OtherCredit.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/app/actions/credits.ts:saveOtherCredit", "src/app/actions/credits.ts:deleteOtherCredit"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  CashTransfer: {
    modelName: "CashTransfer",
    tableName: SYNC_MODEL_CONFIG.CashTransfer.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: [],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  InventoryStock: {
    modelName: "InventoryStock",
    tableName: SYNC_MODEL_CONFIG.InventoryStock.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/lib/domain/inventory/service.ts:txAdjustInventoryStock"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert_material_name_unique",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  InventoryTransaction: {
    modelName: "InventoryTransaction",
    tableName: SYNC_MODEL_CONFIG.InventoryTransaction.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/lib/domain/inventory/service.ts:txAdjustInventoryStock"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  PartyCollection: {
    modelName: "PartyCollection",
    tableName: SYNC_MODEL_CONFIG.PartyCollection.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/app/actions/credits.ts:savePartyCollection", "src/app/actions/credits.ts:deletePartyCollection"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert_source_event_id_unique",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  PartyPayment: {
    modelName: "PartyPayment",
    tableName: SYNC_MODEL_CONFIG.PartyPayment.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/app/actions/credits.ts:savePartyPayment", "src/app/actions/credits.ts:deletePartyPayment"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert_source_event_id_unique",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  PartyLedger: {
    modelName: "PartyLedger",
    tableName: SYNC_MODEL_CONFIG.PartyLedger.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/lib/domain/ledger/party-ledger-service.ts:recalculatePartyLedger"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  EmployeeLedger: {
    modelName: "EmployeeLedger",
    tableName: SYNC_MODEL_CONFIG.EmployeeLedger.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/app/actions/employees.ts:saveEmployeeLedgerEntry"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  OutgoingSale: {
    modelName: "OutgoingSale",
    tableName: SYNC_MODEL_CONFIG.OutgoingSale.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/app/actions/sales.ts:saveSale", "src/app/actions/sales.ts:deleteSale"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert_serial_number_unique",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  IncomingBoulder: {
    modelName: "IncomingBoulder",
    tableName: SYNC_MODEL_CONFIG.IncomingBoulder.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/app/actions/purchases.ts:saveIncomingBoulder", "src/app/actions/purchases.ts:deleteIncomingBoulder"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  Expense: {
    modelName: "Expense",
    tableName: SYNC_MODEL_CONFIG.Expense.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/app/actions/expenses.ts:saveExpense", "src/app/actions/expenses.ts:deleteExpense"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert_source_event_id_unique",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  FuelPurchase: {
    modelName: "FuelPurchase",
    tableName: SYNC_MODEL_CONFIG.FuelPurchase.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/app/actions/fuel.ts:saveFuelPurchase", "src/app/actions/fuel.ts:deleteFuelPurchase"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert_source_event_id_unique",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  MaintenanceRecord: {
    modelName: "MaintenanceRecord",
    tableName: SYNC_MODEL_CONFIG.MaintenanceRecord.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: [],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  MaintenanceSchedule: {
    modelName: "MaintenanceSchedule",
    tableName: SYNC_MODEL_CONFIG.MaintenanceSchedule.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: [],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  VehicleStats: {
    modelName: "VehicleStats",
    tableName: SYNC_MODEL_CONFIG.VehicleStats.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: [],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert_vehicle_id_unique",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  PartyCredit: {
    modelName: "PartyCredit",
    tableName: SYNC_MODEL_CONFIG.PartyCredit.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/app/actions/sales.ts:saveSale"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
  WeighbridgeTicket: {
    modelName: "WeighbridgeTicket",
    tableName: SYNC_MODEL_CONFIG.WeighbridgeTicket.table,
    outboxStatus: "DEFERRED",
    mutationEntryPoints: ["src/app/actions/weighbridge.ts"],
    cloudProjectionMethod: "apply_outbox_event",
    conflictPolicy: "id_upsert_ticket_number_unique",
    evidence: "Phase 5 CP1 cloud allowlist & generic dispatcher",
    cutoverReady: false,
  },
};

export const LEGACY_CALL_SITES: LegacyCallSiteEntry[] = [
  {
    name: "pushSync",
    file: "src/lib/sync/sync-service.ts",
    callers: [
      "src/lib/sync/auto-sync.ts:triggerAutoSync",
      "src/app/actions/sync.ts:triggerSync",
      "src/app/actions/sync.ts:forcePushSync",
      "src/app/actions/admin.ts:forceSync",
      "src/app/api/test-sync/route.ts",
    ],
    classification: "MIGRATE_TO_OUTBOX",
    rationale: "Auto-sync and normal sync must transition to deliverPendingOutbox; legacy push remains only as temporary shadow fallback.",
  },
  {
    name: "pullSync",
    file: "src/lib/sync/sync-service.ts",
    callers: [
      "src/app/actions/sync.ts:triggerSync",
      "src/app/actions/sync.ts:forcePullSync",
      "src/app/actions/admin.ts:forceSync",
      "src/app/api/test-sync/route.ts",
    ],
    classification: "RETAIN",
    rationale: "Pulling remote additions and deletions from cloud remains necessary for multi-device sync.",
  },
  {
    name: "forcePushAllTables",
    file: "src/lib/sync/sync-service.ts",
    callers: [
      "src/app/actions/sync.ts:performForcePushAll",
      "src/app/settings/sync/page.tsx",
    ],
    classification: "RETIRE_UNSAFE",
    rationale: "Unsafe brute-force table scan that overwrites remote state without event tracking or conflict deduplication.",
  },
  {
    name: "resetSyncCursor",
    file: "src/app/actions/sync.ts",
    callers: [
      "src/app/settings/sync/page.tsx",
      "src/app/actions/admin.ts:resetSyncQueue",
    ],
    classification: "RETIRE_UNSAFE",
    rationale: "Rewinding timestamp cursor to 1970 causes collision merge suffixes (e.g. Merge XXXX) and duplicate re-pushes.",
  },
  {
    name: "performFullRestore",
    file: "src/app/actions/sync.ts",
    callers: [
      "src/app/settings/sync/page.tsx",
    ],
    classification: "RETAIN_STAGED",
    rationale: "Phase 3 staged restore provides safe atomic staging, pre-restore backup, and journal recovery.",
  },
];

/**
 * Validates whether all specified models (or all 29 models by default) meet the
 * strict criteria for cutover. Throws if any model is not ready.
 */
export function assertModelCutoverEligible(modelName: SyncModelName): void {
  const entry = CUTOVER_MODEL_MANIFEST[modelName];
  if (!entry) {
    throw new Error(`[Cutover Manifest] Unknown model: "${modelName}"`);
  }
  if (!entry.cutoverReady || entry.outboxStatus !== "MIGRATED") {
    throw new Error(
      `[Cutover Manifest] Model "${modelName}" is NOT eligible for cutover. ` +
      `Status: ${entry.outboxStatus}, CutoverReady: ${entry.cutoverReady}, Evidence: "${entry.evidence}"`
    );
  }
}

/**
 * Returns a summary of cutover readiness across all models and call sites.
 */
export function getCutoverManifestSummary() {
  const allModels = Object.values(CUTOVER_MODEL_MANIFEST);
  const totalModels = allModels.length;
  const migratedModels = allModels.filter((m) => m.outboxStatus === "MIGRATED").length;
  const deferredModels = allModels.filter((m) => m.outboxStatus === "DEFERRED").length;
  const cutoverReadyModels = allModels.filter((m) => m.cutoverReady).length;

  return {
    totalModels,
    migratedModels,
    deferredModels,
    cutoverReadyModels,
    callSites: LEGACY_CALL_SITES.map((cs) => ({
      name: cs.name,
      classification: cs.classification,
      callersCount: cs.callers.length,
    })),
  };
}
