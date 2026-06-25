import { randomUUID } from "crypto";
import path from "path";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  databaseReady?: Promise<void>;
};

const defaultMaterials = [
  ["6 MM", 38],
  ["12 MM", 38],
  ["20 MM", 38],
  ["40 MM", 38],
  ["DUST", 38],
  ["MSAND", 44],
  ["GSB", 39],
] as const;


// Resolve the absolute path to the SQLite database file.
// prisma/local.db lives next to schema.prisma in the prisma/ folder.
// Using an absolute path prevents Prisma Client from misresolving
// relative paths (which it resolves from node_modules/@prisma/client,
// not the project root).
const DB_PATH = path.resolve(process.cwd(), "prisma", "local.db");
const DB_URL = `file:${DB_PATH}`;

export function getPrisma() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      datasources: { db: { url: DB_URL } },
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }

  return globalForPrisma.prisma;
}

export async function ensureDatabase() {
  if (!globalForPrisma.databaseReady) {
    globalForPrisma.databaseReady = initializeDatabase(getPrisma());
  }

  return globalForPrisma.databaseReady;
}

export async function getDb() {
  await ensureDatabase();
  return getPrisma();
}

async function initializeDatabase(prisma: PrismaClient) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY NOT NULL,
      vehicle_number TEXT NOT NULL UNIQUE,
      party_id TEXT,
      party_name TEXT,
      company_body_qty REAL,
      extra_body_qty REAL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS parties (
      id TEXT PRIMARY KEY NOT NULL,
      party_name TEXT NOT NULL UNIQUE,
      phone TEXT,
      address TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY NOT NULL,
      material_name TEXT NOT NULL UNIQUE,
      rate_per_cft REAL NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS outgoing_sales (
      id TEXT PRIMARY KEY NOT NULL,
      sale_date DATETIME NOT NULL,
      serial_number INTEGER NOT NULL UNIQUE,
      vehicle_id TEXT,
      party_id TEXT,
      material_id TEXT,
      vehicle_number TEXT NOT NULL,
      party_name TEXT NOT NULL,
      material_name TEXT NOT NULL,
      rate_per_cft REAL NOT NULL,
      qty REAL NOT NULL,
      discount_type TEXT NOT NULL DEFAULT 'fixed',
      discount_value REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL,
      final_amount REAL NOT NULL,
      cash_paid REAL NOT NULL DEFAULT 0,
      bank_paid REAL NOT NULL DEFAULT 0,
      remarks TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS incoming_boulder (
      id TEXT PRIMARY KEY NOT NULL,
      date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      vehicle_id TEXT,
      party_id TEXT,
      material_id TEXT,
      vehicle_number TEXT NOT NULL,
      party_name TEXT NOT NULL,
      material_name TEXT NOT NULL DEFAULT 'ROCK',
      qty REAL NOT NULL,
      remarks TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS party_credit (
      id TEXT PRIMARY KEY NOT NULL,
      party_id TEXT,
      party_name TEXT NOT NULL,
      sale_id TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS employee_credit (
      id TEXT PRIMARY KEY NOT NULL,
      employee_name TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT,
      expected_due_date DATETIME,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY NOT NULL,
      supplier_name TEXT NOT NULL UNIQUE,
      phone TEXT,
      address TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS day_book_entries (
      id TEXT PRIMARY KEY NOT NULL,
      entry_date DATETIME NOT NULL,
      entry_type TEXT NOT NULL,
      reference TEXT,
      description TEXT,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY NOT NULL,
      entity_name TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY NOT NULL,
      role_name TEXT NOT NULL UNIQUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS outgoing_sales_sale_date_idx ON outgoing_sales (sale_date)`,
    `CREATE INDEX IF NOT EXISTS outgoing_sales_vehicle_number_idx ON outgoing_sales (vehicle_number)`,
    `CREATE INDEX IF NOT EXISTS outgoing_sales_party_name_idx ON outgoing_sales (party_name)`,
    `CREATE INDEX IF NOT EXISTS incoming_boulder_date_idx ON incoming_boulder (date)`,
    `CREATE INDEX IF NOT EXISTS party_credit_party_name_idx ON party_credit (party_name)`,
    `CREATE INDEX IF NOT EXISTS party_credit_sale_id_idx ON party_credit (sale_id)`,
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  for (const [materialName, ratePerCft] of defaultMaterials) {
    await prisma.$executeRaw`
      INSERT INTO materials (id, material_name, rate_per_cft, created_at, updated_at)
      SELECT ${randomUUID()}, ${materialName}, ${ratePerCft}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      WHERE NOT EXISTS (
        SELECT 1 FROM materials WHERE UPPER(material_name) = UPPER(${materialName})
      )
    `;
  }
}
