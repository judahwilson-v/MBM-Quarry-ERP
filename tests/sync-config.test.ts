import assert from "node:assert/strict";
import {
  DIRECT_PUSH_MODELS,
  extractEntityData,
  getRowTimestamp,
  LOCAL_CONFLICT_FIELDS,
  PULL_ORDER,
  resolveSyncModel,
  REMOTE_CONFLICT_COLUMNS,
  SYNC_MODEL_CONFIG,
} from "@/lib/sync/sync-config";

function run() {
  assert.equal(resolveSyncModel("Sale"), "OutgoingSale", "sale audit alias must resolve");
  assert.equal(resolveSyncModel("Vehicle"), "Vehicle");
  assert.equal(resolveSyncModel("UnknownModel"), null);

  for (const modelName of PULL_ORDER) {
    const config = SYNC_MODEL_CONFIG[modelName];
    assert.ok(config.delegate[0] === config.delegate[0].toLowerCase(), `${modelName} delegate must be lower camel case`);
    assert.ok(config.table.length > 0, `${modelName} must have a Supabase table`);
  }

  assert.equal(SYNC_MODEL_CONFIG.PartyLedger.timeColumn, "created_at");
  assert.equal(SYNC_MODEL_CONFIG.CashTransfer.timeColumn, "created_at");
  assert.equal(SYNC_MODEL_CONFIG.EmployeeLedger.timeColumn, "created_at");
  assert.equal(SYNC_MODEL_CONFIG.DayBookExpenseEntry.timeColumn, "created_at");
  assert.equal(SYNC_MODEL_CONFIG.InventoryStock.timeColumn, "last_updated");

  assert.deepEqual(
    extractEntityData({ role: "system", before: null, after: { id: "vehicle-1" }, reason: null }),
    { id: "vehicle-1" },
  );
  assert.deepEqual(extractEntityData({ id: "legacy-1" }), { id: "legacy-1" });
  assert.throws(() => extractEntityData({ after: null }), /missing its entity snapshot/);

  assert.equal(getRowTimestamp({ createdAt: "2026-07-04T10:00:00.000Z" }, "createdAt").toISOString(), "2026-07-04T10:00:00.000Z");
  assert.throws(() => getRowTimestamp({ createdAt: "not-a-date" }, "createdAt"), /invalid createdAt timestamp/);

  assert.deepEqual(DIRECT_PUSH_MODELS, [
    "GlobalSettings",
    "FinancialEvent",
    "LedgerEntry",
    "PartyLedger",
    "DayBook",
    "DayBookExpenseEntry",
    "Employee",
    "EmployeeLedger",
    "CashTransfer",
    "InventoryStock",
    "InventoryTransaction",
  ]);
  assert.equal(REMOTE_CONFLICT_COLUMNS.LedgerEntry, "financial_event_id");
  assert.equal(LOCAL_CONFLICT_FIELDS.LedgerEntry, "financialEventId");
  assert.equal(REMOTE_CONFLICT_COLUMNS.InventoryStock, "material_name");
  assert.equal(LOCAL_CONFLICT_FIELDS.InventoryStock, "materialName");

  console.log("sync configuration tests passed");
}

run();
