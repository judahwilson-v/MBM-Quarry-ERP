import assert from "node:assert/strict";

// Step 1: Pre-populate require.cache to mock Prisma and Supabase for sync-service.ts
const prismaPath = require.resolve("../src/lib/prisma");
const supabasePath = require.resolve("../src/lib/supabase/server");

let mockDb: any = {};
let mockSupabase: any = {};

require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    getDb: async () => mockDb,
  },
} as any;

require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: {
    createClient: () => mockSupabase,
  },
} as any;

// Now dynamically import sync-service
const { pushSync, pullSync } = require("../src/lib/sync/sync-service");

async function runM2ResilienceTests() {
  console.log("=================================================");
  console.log("   MILESTONE 2 RESILIENCE VERIFICATION HARNESS   ");
  console.log("=================================================\n");

  const testResults: { name: string; status: "PASS" | "FAIL"; details: string }[] = [];

  // Helper for creating standard mock DB delegates
  function createMockDelegate() {
    return {
      findUnique: async () => null,
      findMany: async () => [],
      findFirst: async () => null,
      create: async (args: any) => args.data,
      update: async (args: any) => args.data,
      upsert: async (args: any) => args.create || args.update,
      delete: async () => ({}),
      count: async () => 0,
    };
  }

  // Helper for initializing mock DB syncState and all model delegates
  function setupMockDbSyncState() {
    const syncStateStore: Record<string, any> = {
      default: { id: "default", lastSyncedAt: new Date(0), status: "IDLE" },
      pull_state: { id: "pull_state", lastSyncedAt: new Date(0), status: "IDLE" },
    };

    mockDb = {
      syncState: {
        findUnique: async ({ where }: any) => syncStateStore[where.id] || null,
        create: async ({ data }: any) => {
          syncStateStore[data.id] = { ...data };
          return syncStateStore[data.id];
        },
        update: async ({ where, data }: any) => {
          if (syncStateStore[where.id]) {
            syncStateStore[where.id] = { ...syncStateStore[where.id], ...data };
          }
          return syncStateStore[where.id];
        },
      },
      auditLog: {
        findMany: async () => [],
        count: async () => 0,
      },
      globalSettings: createMockDelegate(),
      financialEvent: createMockDelegate(),
      ledgerEntry: createMockDelegate(),
      inventoryStock: createMockDelegate(),
      inventoryTransaction: createMockDelegate(),
      party: createMockDelegate(),
      vehicle: createMockDelegate(),
      material: createMockDelegate(),
      supplier: createMockDelegate(),
      employee: createMockDelegate(),
      outgoingSale: createMockDelegate(),
      incomingBoulder: createMockDelegate(),
      weighbridgeTicket: createMockDelegate(),
      partyCredit: createMockDelegate(),
      partyCollection: createMockDelegate(),
      partyPayment: createMockDelegate(),
      expense: createMockDelegate(),
      employeeCredit: createMockDelegate(),
      otherCredit: createMockDelegate(),
      fuelPurchase: createMockDelegate(),
      dayBook: createMockDelegate(),
      dayBookEntry: createMockDelegate(),
      dayBookExpenseEntry: createMockDelegate(),
      partyLedger: createMockDelegate(),
      employeeLedger: createMockDelegate(),
      cashTransfer: createMockDelegate(),
      maintenanceRecord: createMockDelegate(),
      maintenanceSchedule: createMockDelegate(),
      vehicleStats: createMockDelegate(),
    };
  }

  // Standard mock audit_logs for Supabase
  function getMockAuditLogsBuilder(logsData: any[] = []) {
    return {
      select: () => ({
        eq: () => ({
          gt: () => ({
            order: async () => ({ data: logsData, error: null }),
          }),
        }),
      }),
      upsert: async () => ({ error: null }),
    };
  }

  // -------------------------------------------------------------------------
  // TEST 1: pullSync Table-Level Error Resilience (Fetch Error on single table)
  // -------------------------------------------------------------------------
  try {
    console.log("Test 1: pullSync table-level fetch error isolation...");
    setupMockDbSyncState();

    mockSupabase = {
      from: (tableName: string) => {
        if (tableName === "audit_logs") {
          return getMockAuditLogsBuilder();
        }
        if (tableName === "weighbridge_tickets") {
          return {
            select: () => ({
              gt: () => ({
                order: async () => ({
                  data: null,
                  error: { message: "Simulated Supabase 500 error on weighbridge_tickets table fetch" },
                }),
              }),
            }),
          };
        }
        if (tableName === "materials") {
          return {
            select: () => ({
              gt: () => ({
                order: async () => ({
                  data: [{ id: "mat-1", material_name: "Aggregate 20mm", rate_per_cft: 15, updated_at: new Date().toISOString() }],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            gt: () => ({
              order: async () => ({ data: [], error: null }),
            }),
          }),
        };
      },
    };

    const res = await pullSync();
    console.log("  -> pullSync result:", JSON.stringify(res, null, 2));

    assert.equal(res.status, "PARTIAL_SUCCESS", "Status should be PARTIAL_SUCCESS because materials succeeded and weighbridge_tickets failed");
    assert.equal(res.pulled, 1, "Should have pulled 1 material row");
    assert.equal(res.skipped, 1, "Should have skipped 1 failing table");
    assert.equal(res.errors.length, 1, "Should record exactly 1 error in errors array");
    assert.equal(res.errors[0].table, "weighbridge_tickets", "Error table should be weighbridge_tickets");
    assert.ok(res.errors[0].error.includes("Fetch failed"), "Error message should contain 'Fetch failed'");

    testResults.push({
      name: "Test 1: pullSync Table-Level Fetch Error Isolation",
      status: "PASS",
      details: "weighbridge_tickets fetch error was caught, logged, skipped, and remaining tables (materials) synced successfully.",
    });
  } catch (err: any) {
    testResults.push({
      name: "Test 1: pullSync Table-Level Fetch Error Isolation",
      status: "FAIL",
      details: err?.message || String(err),
    });
  }

  // -------------------------------------------------------------------------
  // TEST 2: pullSync Row-Level Error Resilience (Single row upsert failure)
  // -------------------------------------------------------------------------
  try {
    console.log("\nTest 2: pullSync row-level error isolation...");
    setupMockDbSyncState();

    let partyUpsertCount = 0;
    mockDb.party.upsert = async (args: any) => {
      partyUpsertCount++;
      if (partyUpsertCount === 2) {
        throw new Error("Simulated local SQLite disk I/O write failure on row 2");
      }
      return args.create;
    };

    mockSupabase = {
      from: (tableName: string) => {
        if (tableName === "audit_logs") {
          return getMockAuditLogsBuilder();
        }
        if (tableName === "parties") {
          return {
            select: () => ({
              gt: () => ({
                order: async () => ({
                  data: [
                    { id: "party-1", party_name: "Alpha Quarry Ltd", updated_at: new Date().toISOString() },
                    { id: "party-2", party_name: "Beta Builders (Corrupt Row)", updated_at: new Date().toISOString() },
                    { id: "party-3", party_name: "Gamma Infra Ltd", updated_at: new Date().toISOString() },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            gt: () => ({
              order: async () => ({ data: [], error: null }),
            }),
          }),
        };
      },
    };

    const res = await pullSync();
    console.log("  -> pullSync result:", JSON.stringify(res, null, 2));

    assert.equal(res.status, "PARTIAL_SUCCESS", "Status should be PARTIAL_SUCCESS");
    assert.equal(res.pulled, 2, "Rows 1 and 3 should be pulled successfully");
    assert.equal(res.skipped, 1, "Row 2 should be skipped");
    assert.equal(res.errors.length, 1, "Should log exactly 1 row error");
    assert.equal(res.errors[0].table, "parties", "Error table should be parties");
    assert.equal(res.errors[0].rowId, "party-2", "Error rowId should be party-2");
    assert.ok(res.errors[0].error.includes("SQLite disk I/O write failure"), "Error text should match row exception");

    testResults.push({
      name: "Test 2: pullSync Row-Level Error Isolation",
      status: "PASS",
      details: "Row 2 failure was caught and logged; Row 1 and Row 3 completed successfully without halting loop.",
    });
  } catch (err: any) {
    testResults.push({
      name: "Test 2: pullSync Row-Level Error Isolation",
      status: "FAIL",
      details: err?.message || String(err),
    });
  }

  // -------------------------------------------------------------------------
  // TEST 3: pushSync Audit Log Row Error Isolation (Corrupt JSON / Supabase failure)
  // -------------------------------------------------------------------------
  try {
    console.log("\nTest 3: pushSync audit log row-level error isolation...");
    setupMockDbSyncState();

    const now = new Date();
    mockDb.auditLog.findMany = async () => [
      {
        id: "log-1",
        entityName: "Party",
        entityId: "party-101",
        action: "create",
        payload: JSON.stringify({ id: "party-101", partyName: "Delta Traders" }),
        createdAt: new Date(now.getTime() + 1000),
      },
      {
        id: "log-2",
        entityName: "Party",
        entityId: "party-102",
        action: "create",
        payload: "INVALID_JSON_CORRUPT_PAYLOAD{{{",
        createdAt: new Date(now.getTime() + 2000),
      },
      {
        id: "log-3",
        entityName: "Party",
        entityId: "party-103",
        action: "create",
        payload: JSON.stringify({ id: "party-103", partyName: "Epsilon Corp" }),
        createdAt: new Date(now.getTime() + 3000),
      },
    ];

    mockSupabase = {
      from: () => ({
        upsert: async () => ({ error: null }),
        delete: () => ({ lt: async () => ({ count: 0, error: null }) }),
      }),
    };

    const res = await pushSync();
    console.log("  -> pushSync result:", JSON.stringify(res, null, 2));

    assert.equal(res.status, "PARTIAL_SUCCESS", "Status should be PARTIAL_SUCCESS");
    assert.equal(res.pushed, 2, "Log 1 and Log 3 should be pushed successfully");
    assert.equal(res.skipped, 1, "Log 2 should be skipped due to corrupt JSON");
    assert.equal(res.errors.length, 1, "Should log 1 error for corrupt JSON payload");
    assert.equal(res.errors[0].table, "parties", "Error table should be parties");
    assert.equal(res.errors[0].rowId, "party-102", "Error rowId should be party-102");
    assert.ok(res.errors[0].error.includes("JSON parse error"), "Error should report JSON parse error");

    testResults.push({
      name: "Test 3: pushSync Audit Log Row Error Isolation",
      status: "PASS",
      details: "Corrupt audit log payload was caught and logged to errors array without crashing pushSync loop.",
    });
  } catch (err: any) {
    testResults.push({
      name: "Test 3: pushSync Audit Log Row Error Isolation",
      status: "FAIL",
      details: err?.message || String(err),
    });
  }

  // -------------------------------------------------------------------------
  // TEST 4: pushSync Projection Model & Row Error Isolation
  // -------------------------------------------------------------------------
  try {
    console.log("\nTest 4: pushSync projection model & row error isolation...");
    setupMockDbSyncState();

    mockDb.financialEvent.findMany = async () => {
      throw new Error("Simulated Prisma delegate error on FinancialEvent model");
    };

    mockDb.ledgerEntry.findMany = async () => [
      { id: "ledger-1", createdAt: new Date(), partyId: "p1", amount: 5000 },
    ];

    mockSupabase = {
      from: () => ({
        upsert: async () => ({ error: null }),
        delete: () => ({ lt: async () => ({ count: 0, error: null }) }),
      }),
    };

    const res = await pushSync();
    console.log("  -> pushSync result:", JSON.stringify(res, null, 2));

    assert.equal(res.status, "PARTIAL_SUCCESS", "Status should be PARTIAL_SUCCESS");
    assert.equal(res.pushed, 1, "Ledger entry projection pushed successfully");
    assert.equal(res.errors.length, 1, "FinancialEvent model error logged");
    assert.equal(res.errors[0].table, "financial_events", "Error table should be financial_events");
    assert.ok(res.errors[0].error.includes("FinancialEvent model"), "Error message should mention model exception");

    testResults.push({
      name: "Test 4: pushSync Projection Model & Row Error Isolation",
      status: "PASS",
      details: "Model-level projection error was caught; other direct push models continued successfully.",
    });
  } catch (err: any) {
    testResults.push({
      name: "Test 4: pushSync Projection Model & Row Error Isolation",
      status: "FAIL",
      details: err?.message || String(err),
    });
  }

  // -------------------------------------------------------------------------
  // TEST 5: Unexpected Exception inside Table Loop (Zero Unhandled Throws)
  // -------------------------------------------------------------------------
  try {
    console.log("\nTest 5: Unexpected thrown exception inside table loop...");
    setupMockDbSyncState();

    mockSupabase = {
      from: (tableName: string) => {
        if (tableName === "audit_logs") {
          return getMockAuditLogsBuilder();
        }
        if (tableName === "vehicles") {
          throw new TypeError("Simulated raw network exception thrown synchronously inside supabase.from call");
        }
        return {
          select: () => ({
            gt: () => ({
              order: async () => ({ data: [], error: null }),
            }),
          }),
        };
      },
    };

    const res = await pullSync();
    console.log("  -> pullSync result:", JSON.stringify(res, null, 2));

    assert.ok(res.errors.some((e: any) => e.table === "vehicles" && e.error.toLowerCase().includes("simulated raw network exception")), "Vehicles table exception logged in errors array");

    testResults.push({
      name: "Test 5: Zero Unhandled Throws on Synchronous Exception",
      status: "PASS",
      details: "Synchronous exception in supabase.from was safely caught by table-level try/catch.",
    });
  } catch (err: any) {
    testResults.push({
      name: "Test 5: Zero Unhandled Throws on Synchronous Exception",
      status: "FAIL",
      details: err?.message || String(err),
    });
  }

  // -------------------------------------------------------------------------
  // VERIFICATION SUMMARY
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log("           VERIFICATION SUMMARY RESULTS           ");
  console.log("=================================================");
  let hasFailure = false;
  for (const r of testResults) {
    console.log(`[${r.status}] ${r.name}`);
    console.log(`        Details: ${r.details}`);
    if (r.status === "FAIL") hasFailure = true;
  }

  if (hasFailure) {
    console.error("\n❌ HARNESS FAILED: One or more tests failed.");
    process.exit(1);
  } else {
    console.log("\n✅ HARNESS PASSED: All M2 resilience tests succeeded!");
  }
}

runM2ResilienceTests().catch((err) => {
  console.error("FATAL HARNESS ERROR:", err);
  process.exit(1);
});
