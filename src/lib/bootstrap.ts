import { PrismaClient, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { runMigrations, ALL_MIGRATIONS } from "./migrations";
import { clearStaleBarrierAtProcessStart } from "./sync/restore-state";

export async function initializeDatabase(prisma: PrismaClient) {
  // ---------------------------------------------------------------------------
  // Versioned Migration Runner
  // ---------------------------------------------------------------------------
  // Replaces the previous three competing schema mechanisms:
  //   1. bootstrap-ddl.json (CREATE TABLE IF NOT EXISTS)
  //   2. ensureSQLiteColumn() ad-hoc ALTER TABLE calls
  //   3. scripts/migrate.js Electron startup patches
  //
  // All schema changes are now defined in src/lib/migrations/definitions/
  // and executed in strict version order with tracking in schema_migrations.
  // ---------------------------------------------------------------------------
  const result = await runMigrations(prisma, ALL_MIGRATIONS);

  if (result.errors.length > 0) {
    console.error("==========================================");
    console.error("FATAL: Database migration failed!");
    console.error(result.errors.join("\n"));
    console.error("==========================================");
    throw new Error(`Database migration failed: ${result.errors[0]}`);
  }

  // FULL63: per-process stale restart-barrier sweep (the real production
  // caller; previously the hook had none). A crashed restore leaves a dead
  // marker; this preserves the ordinary real-restart contract - the next
  // process starts clean and restores stay available. Live and unverifiable
  // markers are kept fail-closed.
  try {
    clearStaleBarrierAtProcessStart();
  } catch (error) {
    console.error("[Bootstrap] stale restart-barrier sweep failed (fail-closed, barrier kept):", error);
  }

  if (result.applied > 0) {
    console.log(`[Bootstrap] Applied ${result.applied} migration(s) successfully.`);
  } else {
    console.log("[Bootstrap] Database schema is up to date (no migrations to apply).");
  }

  // ---------------------------------------------------------------------------
  // Seed data — default records inserted only if they don't already exist
  // ---------------------------------------------------------------------------
  for (const [materialName, ratePerCft] of defaultMaterials) {
    await prisma.$executeRaw`
      INSERT INTO materials (id, material_name, rate_per_cft, created_at, updated_at)
      SELECT ${randomUUID()}, ${materialName}, ${ratePerCft}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      WHERE NOT EXISTS (
        SELECT 1 FROM materials WHERE UPPER(material_name) = UPPER(${materialName})
      )
    `;
  }

  for (const [partyName, partyGroup] of defaultParties) {
    await prisma.$executeRaw`
      INSERT INTO parties (id, party_name, party_group, created_at, updated_at)
      SELECT ${randomUUID()}, ${partyName}, ${partyGroup}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      WHERE NOT EXISTS (
        SELECT 1 FROM parties WHERE UPPER(party_name) = UPPER(${partyName})
      )
    `;
  }

  for (const [vehicleNumber, companyBodyQty, extraBodyQty, vehicleType] of defaultVehicles) {
    const normalized = vehicleNumber.trim().replace(/\s+/g, " ").toUpperCase();
    await prisma.$executeRaw`
      INSERT INTO vehicles (id, vehicle_number, company_body_qty, extra_body_qty, vehicle_type, created_at, updated_at)
      SELECT ${randomUUID()}, ${normalized}, ${companyBodyQty}, ${extraBodyQty}, ${vehicleType}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      WHERE NOT EXISTS (
        SELECT 1 FROM vehicles WHERE UPPER(vehicle_number) = UPPER(${normalized})
      )
    `;
  }

  for (const [employeeName, role] of defaultEmployees) {
    await prisma.$executeRaw`
      INSERT INTO employees (id, name, role, created_at, updated_at)
      SELECT ${randomUUID()}, ${employeeName}, ${role}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      WHERE NOT EXISTS (
        SELECT 1 FROM employees WHERE UPPER(name) = UPPER(${employeeName})
      )
    `;
  }

  for (const supplierName of defaultSuppliers) {
    await prisma.$executeRaw`
      INSERT INTO suppliers (id, supplier_name, created_at, updated_at)
      SELECT ${randomUUID()}, ${supplierName}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      WHERE NOT EXISTS (
        SELECT 1 FROM suppliers WHERE UPPER(supplier_name) = UPPER(${supplierName})
      )
    `;
  }

  // ---------------------------------------------------------------------------
  // Post-migration Integrity & Compatibility Gate
  // ---------------------------------------------------------------------------
  await verifySchemaSync(prisma);
}

/**
 * Validates database integrity against Prisma model definitions and critical column invariants.
 */
export async function verifySchemaSync(prisma: PrismaClient) {
  const result = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type='table'"
  );
  const existingTables = result.map((r) => r.name.toLowerCase());

  const prismaModels = Prisma.dmmf.datamodel.models;
  const missingTables: string[] = [];

  for (const model of prismaModels) {
    const tableName = (model.dbName || model.name).toLowerCase();
    if (!existingTables.includes(tableName)) {
      missingTables.push(tableName);
    }
  }

  if (missingTables.length > 0) {
    console.error("==========================================");
    console.error("FATAL SCHEMA DESYNC DETECTED!");
    console.error("The following tables exist in schema.prisma but are missing from the database:");
    console.error(missingTables.join(", "));
    console.error("Please add a new migration in src/lib/migrations/definitions/");
    console.error("==========================================");
    throw new Error(`Schema Desync: Missing tables in SQLite database: ${missingTables.join(", ")}`);
  }

  // Critical column invariant check
  const wbCols = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info("weighbridge_tickets")`
  );
  const wbColNames = wbCols.map((c) => c.name);
  if (!wbColNames.includes("ticket_type")) {
    console.error("==========================================");
    console.error("FATAL COLUMN DESYNC DETECTED!");
    console.error("weighbridge_tickets is missing the required 'ticket_type' column!");
    console.error("==========================================");
    throw new Error("Schema Desync: weighbridge_tickets.ticket_type column is missing");
  }

  console.log("[Bootstrap] Schema sync verified successfully. All Prisma models and critical columns match SQLite schema.");
}

const defaultMaterials = [
  ["6 MM", 38],
  ["12 MM", 38],
  ["20 MM", 40],
  ["40 MM", 38],
  ["DUST", 38],
  ["MSAND", 45],
  ["GSB", 39],
] as const;

const defaultParties: [string, string][] = [
  // intentionally empty: real directory data enters via private import, never via public source
];

const defaultVehicles: [string, number | null, number | null, string | null][] = [
  // intentionally empty: the company vehicle registry is private; imported per-install, never shipped
];

const defaultEmployees: [string, string][] = [];

const defaultSuppliers: string[] = [];
