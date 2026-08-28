import { PrismaClient } from "@prisma/client";
import * as path from "path";
import * as fs from "fs";
import { runMigrations, ALL_MIGRATIONS, Migration } from "../src/lib/migrations";
import { initializeDatabase, verifySchemaSync } from "../src/lib/bootstrap";

const BACKUP_PATH = path.resolve(__dirname, "../prisma/local.db.backup_phase0_20260827");
const TEST_DIR = path.resolve(__dirname, "../prisma");

function getTempDbPath(name: string): string {
  return path.resolve(TEST_DIR, `${name}.db`);
}

function cleanTempDb(dbPath: string) {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
  if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);
}

async function runTestSuite() {
  console.log("===============================================================");
  console.log("             MBM1 PHASE 1 EXTENDED AUTOMATED TEST SUITE        ");
  console.log("===============================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  // ---------------------------------------------------------------------------
  // TEST 1: Fresh Database Initialization
  // ---------------------------------------------------------------------------
  totalTests++;
  console.log("--- [TEST 1] Fresh Database Provisioning ---");
  const freshDbPath = getTempDbPath("test_fresh_phase1");
  cleanTempDb(freshDbPath);

  const freshPrisma = new PrismaClient({
    datasources: { db: { url: `file:${freshDbPath.replace(/\\/g, "/")}` } },
  });

  try {
    await initializeDatabase(freshPrisma);

    // Verify schema_migrations table
    const migs = await freshPrisma.$queryRawUnsafe<Array<{ version: number; id: string; checksum: string }>>(
      "SELECT version, id, checksum FROM schema_migrations ORDER BY version"
    );
    if (migs.length !== ALL_MIGRATIONS.length) {
      throw new Error(`Expected ${ALL_MIGRATIONS.length} applied migrations, got ${migs.length}`);
    }

    // Verify all model tables + schema_migrations exist (at least 33 tables)
    const tables = await freshPrisma.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const tableNames = tables.map((t) => t.name.toLowerCase());
    if (tableNames.length < 33) {
      throw new Error(`Expected at least 33 tables in SQLite master, got ${tableNames.length}`);
    }

    // Verify weighbridge_tickets column is ticket_type (snake_case)
    const wbCols = await freshPrisma.$queryRawUnsafe<Array<{ name: string }>>(
      `PRAGMA table_info("weighbridge_tickets")`
    );
    const wbColNames = wbCols.map((c) => c.name);
    if (!wbColNames.includes("ticket_type") || wbColNames.includes("ticketType")) {
      throw new Error(`weighbridge_tickets column mismatch: ${wbColNames.join(", ")}`);
    }

    // Verify default seeds exist
    const matCount = await freshPrisma.material.count();
    const partyCount = await freshPrisma.party.count();
    if (matCount === 0 || partyCount === 0) {
      throw new Error(`Seed data missing: materials=${matCount}, parties=${partyCount}`);
    }

    // Verify startup compatibility gate passes
    await verifySchemaSync(freshPrisma);

    console.log("  ✅ PASS: Fresh database initialized with all 33 tables, correct columns, seed data, and passing schema sync.\n");
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: Test 1 failed: ${err?.message || err}\n`);
  } finally {
    await freshPrisma.$disconnect();
    cleanTempDb(freshDbPath);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Legacy Database ticketType Upgrade & Data Integrity
  // ---------------------------------------------------------------------------
  totalTests++;
  console.log("--- [TEST 2] Legacy Database Upgrade (ticketType -> ticket_type) ---");
  const legacyDbPath = getTempDbPath("test_legacy_upgrade_phase1");
  cleanTempDb(legacyDbPath);

  if (!fs.existsSync(BACKUP_PATH)) {
    throw new Error(`Phase 0 backup file not found at: ${BACKUP_PATH}`);
  }
  fs.copyFileSync(BACKUP_PATH, legacyDbPath);

  const legacyPrisma = new PrismaClient({
    datasources: { db: { url: `file:${legacyDbPath.replace(/\\/g, "/")}` } },
  });

  try {
    // Check initial state before migration
    const initialWbCols = await legacyPrisma.$queryRawUnsafe<Array<{ name: string }>>(
      `PRAGMA table_info("weighbridge_tickets")`
    );
    const initialColNames = initialWbCols.map((c) => c.name);
    if (!initialColNames.includes("ticketType")) {
      throw new Error("Precondition failed: backup should contain ticketType camelCase column");
    }

    const initialWbRows = await legacyPrisma.$queryRawUnsafe<Array<{ cnt: bigint | number }>>(
      "SELECT COUNT(*) as cnt FROM weighbridge_tickets"
    );
    const expectedWbCount = Number(initialWbRows[0].cnt);
    if (expectedWbCount !== 65) {
      throw new Error(`Expected 65 weighbridge rows in backup, found ${expectedWbCount}`);
    }

    // Run migration via initializeDatabase
    await initializeDatabase(legacyPrisma);

    // Verify column was renamed to ticket_type
    const postWbCols = await legacyPrisma.$queryRawUnsafe<Array<{ name: string }>>(
      `PRAGMA table_info("weighbridge_tickets")`
    );
    const postColNames = postWbCols.map((c) => c.name);
    if (!postColNames.includes("ticket_type") || postColNames.includes("ticketType")) {
      throw new Error(`Column rename failed: columns are ${postColNames.join(", ")}`);
    }

    // Verify row count preserved exactly
    const postWbRows = await legacyPrisma.$queryRawUnsafe<Array<{ cnt: bigint | number }>>(
      "SELECT COUNT(*) as cnt FROM weighbridge_tickets"
    );
    const actualWbCount = Number(postWbRows[0].cnt);
    if (actualWbCount !== 65) {
      throw new Error(`Data loss in weighbridge_tickets: expected 65, got ${actualWbCount}`);
    }

    // Verify other business data preservation
    const salesCount = await legacyPrisma.outgoingSale.count();
    const vehicleCount = await legacyPrisma.vehicle.count();
    const partyCount = await legacyPrisma.party.count();
    if (salesCount !== 19 || vehicleCount !== 216 || partyCount < 44) {
      throw new Error(`Data loss in business tables: sales=${salesCount}, vehicles=${vehicleCount}, parties=${partyCount}`);
    }

    // Verify Prisma query executes cleanly without schema errors
    const tickets = await legacyPrisma.weighbridgeTicket.findMany({ take: 3 });
    if (tickets.length === 0 || !tickets[0].ticketType) {
      throw new Error(`Prisma client failed to fetch weighbridge ticket properly`);
    }

    console.log(`  ✅ PASS: Legacy database upgraded successfully. 65 weighbridge tickets preserved, ticketType renamed to ticket_type, Prisma queries work.\n`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: Test 2 failed: ${err?.message || err}\n`);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Migration Idempotency
  // ---------------------------------------------------------------------------
  totalTests++;
  console.log("--- [TEST 3] Migration Idempotency ---");
  try {
    const rerunResult = await runMigrations(legacyPrisma, ALL_MIGRATIONS);
    if (rerunResult.applied !== 0 || rerunResult.errors.length !== 0) {
      throw new Error(`Idempotency violated: applied=${rerunResult.applied}, errors=${rerunResult.errors.join(", ")}`);
    }

    // Run initializeDatabase again
    await initializeDatabase(legacyPrisma);

    console.log("  ✅ PASS: Re-running migrations on upgraded database applies 0 migrations and produces 0 errors.\n");
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: Test 3 failed: ${err?.message || err}\n`);
  } finally {
    await legacyPrisma.$disconnect();
    cleanTempDb(legacyDbPath);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Rollback On Failure
  // ---------------------------------------------------------------------------
  totalTests++;
  console.log("--- [TEST 4] Rollback on Migration Failure ---");
  const rollbackDbPath = getTempDbPath("test_rollback_phase1");
  cleanTempDb(rollbackDbPath);
  fs.copyFileSync(BACKUP_PATH, rollbackDbPath);

  const rollbackPrisma = new PrismaClient({
    datasources: { db: { url: `file:${rollbackDbPath.replace(/\\/g, "/")}` } },
  });

  try {
    // Run migrations v1 and v2 first
    const v1v2 = ALL_MIGRATIONS.slice(0, 2);
    const initialRun = await runMigrations(rollbackPrisma, v1v2);
    if (initialRun.applied !== 2) {
      throw new Error(`Expected 2 initial migrations applied, got ${initialRun.applied}`);
    }

    // Define a faulty migration v5 with a statement that creates a table and a second statement that fails
    const faultyMigration: Migration = {
      version: 5,
      id: "005_faulty_test_migration",
      description: "Faulty migration to test rollback",
      up: async () => [
        `CREATE TABLE temporary_test_marker (id TEXT PRIMARY KEY);`,
        `INSERT INTO temporary_test_marker (id) VALUES ('row1');`,
        `INVALID SQL STATEMENT THAT FAILS INTENTIONALLY;`,
      ],
    };

    const failingRun = await runMigrations(rollbackPrisma, [...v1v2, faultyMigration]);
    if (failingRun.errors.length === 0) {
      throw new Error("Faulty migration was expected to fail, but succeeded");
    }

    // Verify transaction rollback: temporary_test_marker table should NOT exist
    const markerTable = await rollbackPrisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='temporary_test_marker'`
    );
    if (markerTable.length > 0) {
      throw new Error("Rollback failed: temporary_test_marker was committed despite subsequent failure");
    }

    // Verify schema_migrations does NOT contain version 5
    const mig5 = await rollbackPrisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM schema_migrations WHERE version = 5`
    );
    if (mig5.length > 0) {
      throw new Error("schema_migrations recorded failed version 5");
    }

    // Verify database is still operational
    const validMigs = await rollbackPrisma.$queryRawUnsafe<Array<{ version: number }>>(
      `SELECT version FROM schema_migrations ORDER BY version`
    );
    if (validMigs.length !== 2) {
      throw new Error(`Expected 2 valid migrations recorded, found ${validMigs.length}`);
    }

    console.log("  ✅ PASS: Faulty migration triggered clean rollback. No partial DDL committed, failed version unrecorded, DB remains healthy.\n");
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: Test 4 failed: ${err?.message || err}\n`);
  } finally {
    await rollbackPrisma.$disconnect();
    cleanTempDb(rollbackDbPath);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Startup Compatibility Gate
  // ---------------------------------------------------------------------------
  totalTests++;
  console.log("--- [TEST 5] Startup Compatibility Gate Verification ---");
  const gateDbPath = getTempDbPath("test_gate_phase1");
  cleanTempDb(gateDbPath);

  const gatePrisma = new PrismaClient({
    datasources: { db: { url: `file:${gateDbPath.replace(/\\/g, "/")}` } },
  });

  try {
    await initializeDatabase(gatePrisma);

    // Case A: Missing Table Gate Check
    await gatePrisma.$executeRawUnsafe(`DROP TABLE audit_logs;`);
    let caughtTableDesync = false;
    try {
      await verifySchemaSync(gatePrisma);
    } catch (e: any) {
      if (e.message.includes("Schema Desync: Missing tables in SQLite database: audit_logs")) {
        caughtTableDesync = true;
      }
    }
    if (!caughtTableDesync) {
      throw new Error("Startup gate failed to detect missing 'audit_logs' table");
    }

    // Case B: Missing Critical Column Check
    await gatePrisma.$executeRawUnsafe(`CREATE TABLE audit_logs (id TEXT PRIMARY KEY, entity_name TEXT, entity_id TEXT, action TEXT, created_at DATETIME);`);
    await gatePrisma.$executeRawUnsafe(`ALTER TABLE weighbridge_tickets RENAME COLUMN ticket_type TO ticketType;`);
    let caughtColDesync = false;
    try {
      await verifySchemaSync(gatePrisma);
    } catch (e: any) {
      if (e.message.includes("Schema Desync: weighbridge_tickets.ticket_type column is missing")) {
        caughtColDesync = true;
      }
    }
    if (!caughtColDesync) {
      throw new Error("Startup gate failed to detect missing critical column 'ticket_type'");
    }

    console.log("  ✅ PASS: Startup compatibility gate accurately intercepts and blocks missing tables and drifted critical columns.\n");
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: Test 5 failed: ${err?.message || err}\n`);
  } finally {
    await gatePrisma.$disconnect();
    cleanTempDb(gateDbPath);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: 001_baseline Immutability (Decoupled from generated bootstrap-ddl.json)
  // ---------------------------------------------------------------------------
  totalTests++;
  console.log("--- [TEST 6] 001_baseline Immutability Verification ---");
  const baselineFilePath = path.resolve(__dirname, "../src/lib/migrations/definitions/001_baseline.ts");
  const baselineContent = fs.readFileSync(baselineFilePath, "utf-8");

  try {
    // 1. Verify 001_baseline.ts does not import bootstrap-ddl.json
    if (baselineContent.includes("bootstrap-ddl.json")) {
      throw new Error("001_baseline.ts still imports or references bootstrap-ddl.json!");
    }

    // 2. Verify static statements array exists
    if (!baselineContent.includes("BASELINE_TABLES") || !baselineContent.includes("BASELINE_INDEXES")) {
      throw new Error("001_baseline.ts does not define static BASELINE_TABLES and BASELINE_INDEXES snapshots!");
    }

    // 3. Verify execution produces deterministic statements independent of bootstrap-ddl.json
    const baselineMigration = (await import("../src/lib/migrations/definitions/001_baseline")).default;
    const dummyPrisma = {} as any;
    const stmts = await baselineMigration.up(dummyPrisma);

    if (stmts.length !== 32 + 100) {
      throw new Error(`Expected 132 statements (32 tables + 100 indexes), got ${stmts.length}`);
    }

    console.log("  ✅ PASS: 001_baseline is completely decoupled and immutable (132 static DDL statements, 0 runtime JSON imports).\n");
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: Test 6 failed: ${err?.message || err}\n`);
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Single Packaged Migration Path Verification
  // ---------------------------------------------------------------------------
  totalTests++;
  console.log("--- [TEST 7] Single Packaged Migration Path Verification ---");
  const desktopMainPath = path.resolve(__dirname, "../desktop/main.js");
  const desktopMainContent = fs.readFileSync(desktopMainPath, "utf-8");
  const afterPackPath = path.resolve(__dirname, "../scripts/after-pack.js");
  const afterPackContent = fs.readFileSync(afterPackPath, "utf-8");

  try {
    // 1. Verify desktop/main.js does not spawn migrate.js
    if (desktopMainContent.includes("migrate.js") || desktopMainContent.includes("Auto-Migrator")) {
      throw new Error("desktop/main.js still contains legacy migrate.js / auto-migrator execution code!");
    }

    // 2. Verify after-pack.js does not copy migrate.js
    if (afterPackContent.includes("migrate.js")) {
      throw new Error("scripts/after-pack.js still contains code to copy migrate.js!");
    }

    // 3. Verify single migration entry point in Next.js bootstrap
    const bootstrapPath = path.resolve(__dirname, "../src/lib/bootstrap.ts");
    const bootstrapContent = fs.readFileSync(bootstrapPath, "utf-8");
    if (!bootstrapContent.includes("runMigrations(prisma, ALL_MIGRATIONS)")) {
      throw new Error("src/lib/bootstrap.ts does not call runMigrations!");
    }

    console.log("  ✅ PASS: Packaged startup and development runtimes both route through exactly one unified migration pipeline (initializeDatabase).\n");
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: Test 7 failed: ${err?.message || err}\n`);
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("===============================================================");
  console.log(`TOTAL TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
  console.log("===============================================================\n");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTestSuite().catch((e) => {
  console.error("FATAL SUITE ERROR:", e);
  process.exit(1);
});
