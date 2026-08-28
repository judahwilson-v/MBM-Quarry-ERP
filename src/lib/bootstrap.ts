import { PrismaClient, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { runMigrations, ALL_MIGRATIONS } from "./migrations";

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
  ["Vijayalakshmi", "BUYER"],
  ["Anugraha", "BUYER"],
  ["Prasad", "BUYER"],
  ["Jayadevan", "BUYER"],
  ["Suresh", "BUYER"],
  ["Faraz", "BUYER"],
  ["Nishad", "BUYER"],
  ["Kazim", "BUYER"],
  ["Prasanth kmp", "BUYER"],
  ["Costone", "BUYER"],
  ["Industrial Estate", "BUYER"],
  ["Prabash", "BUYER"],
  ["Myna", "BUYER"],
  ["Narayanankutty", "BUYER"],
  ["Asif", "TRUCK_OWNER"],
  ["Sunil", "TRUCK_OWNER"],
  ["Abbey", "TRUCK_OWNER"],
  ["Theravil", "TRUCK_OWNER"],
  ["Fathima", "BOULDER_SUPPLIER"],
  ["Dark stone", "BOULDER_SUPPLIER"],
  ["Bijay", "WORKER"],
  ["Manohari", "WORKER"],
  ["Mani", "WORKER"],
  ["Pump- Ambalapara", "PUMP"],
];

const defaultVehicles: [string, number | null, number | null, string | null][] = [
  ["KL 51 N 1401", null, 190, null],
  ["KL 58 S 1994", null, 180, null],
  ["KL 55 AA 1457", 145, 180, null],
  ["KL 09 AW 1861", 135, 175, null],
  ["KL 45 S 1087", 140, 164, null],
  ["KL 50 A 5442", 145, 183, null],
  ["KL 51 A 2407", 85, null, null],
  ["KL 51 K 1824", 370, null, null],
  ["KL 51 C 7376", 130, null, null],
  ["KL 55 AF 1665", 300, null, null],
  ["KL 19 A 6474", 85, null, null],
  ["KL 40 A 4586", 85, null, null],
  ["KL 51 C 1972", 30, null, "PICKUP"],
  ["KL 09 AH 1508", null, 166, null],
  ["KL 09 X 1294", null, 180, null],
  ["KL 22 D 1206", 145, 190, null],
  ["KL 51 R 1092", 182, null, null],
  ["KL 20 P 155", 395, null, null],
  ["KL 9 AB 1189", null, 180, null],
  ["KL 51 A 1188", 95, null, null],
  ["KL 57 C 1214", 145, 175, null],
  ["KL 09 W 1232", null, 177, null],
  ["KL 09 AZ 1232", 135, 180, null],
  ["KL 11 AL 1937", 145, 180, null],
  ["KL 11 X 1583", 85, null, null],
  ["KL 45 F 099", 90, null, null],
  ["KL 48 B 1499", 80, 110, null],
  ["KL 53 R 0197", 136, 180, null],
  ["KL 6 D 1942", 50, null, "PICKUP"],
  ["KL 19 A 1499", 85, null, null],
  ["KL 09 AY 1198", 135, 162, null],
  ["KL 64 A 1843", 87, null, null],
  ["KL 50 L 1581", 143, 179, null],
  ["KL 51 1134", 85, null, null],
  ["KL 51 Q 0702", 230, 275, null],
  ["KL 24 Q 1431", 140, 175, null],
  ["KL 50 E 1855", 140, 178, null],
  ["KL 51 L 1909", 145, 180, null],
  ["KL 7 BY 1494", 135, 170, null],
  ["KL 8 AP 1893", 140, 195, null],
  ["KL 48 B 1809", 135, null, null],
  ["KL 50 C 194", 140, 170, null],
  ["KL 51 B 1626", 85, null, null],
  ["KL 45 F 1543", 85, null, null],
  ["KL 50 B 1065", 140, 173, null],
  ["KL 58 W 1486", 35, null, null],
  ["KL 24 C 1605", 48, null, null],
  ["KL 12 G 1973", 145, 170, null],
  ["KL 13 AH 1455", 133, null, null],
  ["KL 58 G 1273", 130, 175, null],
  ["KL 51 M 1540", 146, 188, null],
  ["KL 51 M 1385", 135, 170, null],
  ["KL 8 AK 130", 150, null, null],
  ["KL 45 F 1017", 87, null, null],
  ["KL 14B 1627", 150, null, null],
  ["KL 50 1693", 145, null, null],
  ["KL 50 A 137", 145, 190, null],
  ["KL 56 M 1838", 30, null, null],
  ["KL 9 Y 1886", 88, null, null],
  ["KL 40 AC 1641", 85, null, null],
  ["KL 48 H 1566", 47, null, null],
  ["KL 59 1979", 95, null, null],
  ["KL 08 BG 1778", 150, 188, null],
  ["KL 45 1268", 90, null, null],
  ["KL 58 E 1540", 145, 170, null],
  ["KL 50 G 1634", 290, null, null],
  ["KL 50 G 1731", 100, 140, null],
  ["KL 60 F 1570", 150, 180, null],
  ["KL 51 A 198", 140, 180, null],
  ["KL 50 F 1009", 350, null, null],
  ["KL 10 AF 156", 93, 130, null],
  ["KL 64 D 105", 152, 185, null],
  ["KL 40 C 1165", 85, null, null],
  ["KL 05 S 1114", 305, null, null],
  ["KL 44 A 180", 50, null, null],
  ["KL 10 AP 1794", 148, 188, null],
  ["KL 04 W 1430", 94, null, null],
  ["KL 9 R 1926", 95, null, null],
  ["KL 51 F 1097", 50, null, "PICKUP"],
  ["KL 51 F 1448", 60, null, null],
  ["KL 50 D 1634", 140, 173, null],
  ["KL 59 C 1755", 145, 178, null],
  ["KL 51 C 1361", 140, 198, null],
  ["KL 73 1051", 150, 185, null],
  ["KL 9 AE 1619", 65, null, null],
  ["KL 50 B 1506", 145, 175, null],
  ["KL 51 A 1080", 146, 182, null],
  ["KL 50 E 1327", 135, 170, null],
  ["KL 40 B 189", 148, 180, null],
  ["KL 52 C 127", 140, 158, null],
  ["KL 51 D 1938", 140, null, null],
  ["KL 50 E 1863", 147, 175, null],
  ["KL 50 E 1634", 140, 175, null],
  ["KL 50 E 1099", 140, 180, null],
  ["KL 9 AA 1888", 350, null, null],
  ["KL 50 E 8965", 145, 175, null],
  ["KL 50 A 4013", 140, 180, null],
  ["KL 51 P 2224", 230, 280, null],
  ["KL 19 A 7797", 85, 105, null],
  ["KL 36 B 7092", null, null, "COMPANY_TRUCK"],
  ["KL 17 J 5911", null, null, "JCB"],
];

const defaultEmployees: [string, string][] = [
  ["Sundareswaran K", "GM"],
  ["Lathesh", "ACCOUNTS"],
  ["Sujith", "SUPERVISOR"],
  ["Shiva Kumar", "STORE_KEEPER"],
  ["Sandeep", "EXCAVATOR_MANAGER"],
  ["Pradeep", "EXCAVATOR_OPERATOR"],
  ["Jayan", "DRIVER"],
  ["Vijai", "WELDER"],
  ["Vasu", "GENERAL"],
  ["Manir Bhai", "MULTI_PURPOSE"],
  ["Sasi", "CRUSHER_OPERATOR"],
  ["Manoj", "GENERAL"],
  ["Swaminatham", "LOADING"],
  ["Balan", "PICKUP_DRIVER"],
  ["Kumari", "KITCHEN_COOK"],
];

const defaultSuppliers: string[] = [
  "Qsand",
  "Silver Storm",
];
