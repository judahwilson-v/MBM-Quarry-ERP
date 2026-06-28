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


// Resolve the database URL.
// In production (Electron packaged), desktop/main.js sets DATABASE_URL
// to an absolute path in the user's appData directory.
// In development, we resolve relative to the project root.
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const dbPath = path.resolve(process.cwd(), "prisma", "local.db");
  return `file:${dbPath}`;
}

// Helper to extract the filesystem path from a DATABASE_URL.
// Handles: "file:./local.db", "file:/abs/path", "file:C:\path", "./relative"
export function getDatabaseFilePath(): string {
  const dbUrl = process.env.DATABASE_URL || `file:${path.resolve(process.cwd(), "prisma", "local.db")}`;
  return dbUrl.replace(/^file:/, "");
}

export function getPrisma() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      datasources: { db: { url: resolveDatabaseUrl() } },
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
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      version INTEGER NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY NOT NULL,
      vehicle_number TEXT NOT NULL UNIQUE,
      party_id TEXT,
      party_name TEXT,
      company_body_qty REAL,
      extra_body_qty REAL,
      trip_count INTEGER NOT NULL DEFAULT 0,
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
      original_qty REAL,
      quantity_reason TEXT,
      trip_delta INTEGER NOT NULL DEFAULT 1,
      discount_type TEXT NOT NULL DEFAULT 'fixed',
      discount_value REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL,
      final_amount REAL NOT NULL,
      cash_paid REAL NOT NULL DEFAULT 0,
      bank_paid REAL NOT NULL DEFAULT 0,
      gpay_paid REAL NOT NULL DEFAULT 0,
      paid_total REAL NOT NULL DEFAULT 0,
      remaining_credit REAL NOT NULL DEFAULT 0,
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
    `CREATE TABLE IF NOT EXISTS financial_events (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL UNIQUE,
      correlation_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1,
      payload JSON NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS financial_events_correlation_id_idx ON financial_events (correlation_id)`,
    `CREATE INDEX IF NOT EXISTS financial_events_entity_type_entity_id_idx ON financial_events (entity_type, entity_id)`,
    `CREATE INDEX IF NOT EXISTS financial_events_event_type_idx ON financial_events (event_type)`,
    `CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY NOT NULL,
      financial_event_id TEXT NOT NULL UNIQUE,
      correlation_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      entry_date DATETIME NOT NULL,
      cash_amount REAL NOT NULL DEFAULT 0,
      bank_amount REAL NOT NULL DEFAULT 0,
      gpay_amount REAL NOT NULL DEFAULT 0,
      credit_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS ledger_entries_correlation_id_idx ON ledger_entries (correlation_id)`,
    `CREATE INDEX IF NOT EXISTS ledger_entries_entity_type_entity_id_idx ON ledger_entries (entity_type, entity_id)`,
    `CREATE INDEX IF NOT EXISTS ledger_entries_event_type_idx ON ledger_entries (event_type)`,
    `CREATE TABLE IF NOT EXISTS day_books (
      id TEXT PRIMARY KEY NOT NULL,
      business_date DATETIME NOT NULL UNIQUE,
      opening_cash_balance REAL NOT NULL DEFAULT 0,
      opening_bank_balance REAL NOT NULL DEFAULT 0,
      cash_sales_total REAL NOT NULL DEFAULT 0,
      bank_sales_total REAL NOT NULL DEFAULT 0,
      gpay_sales_total REAL NOT NULL DEFAULT 0,
      expense_total REAL NOT NULL DEFAULT 0,
      closing_cash_balance REAL NOT NULL DEFAULT 0,
      closing_bank_balance REAL NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS day_books_business_date_idx ON day_books (business_date)`,
    `CREATE TABLE IF NOT EXISTS day_book_expense_entries (
      id TEXT PRIMARY KEY NOT NULL,
      day_book_id TEXT NOT NULL,
      source_event_id TEXT NOT NULL UNIQUE,
      expense_type TEXT NOT NULL,
      entry_date DATETIME NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS day_book_expense_entries_day_book_id_idx ON day_book_expense_entries (day_book_id)`,
    `CREATE INDEX IF NOT EXISTS day_book_expense_entries_entry_date_idx ON day_book_expense_entries (entry_date)`,
    `CREATE TABLE IF NOT EXISTS party_collections (
      id TEXT PRIMARY KEY NOT NULL,
      party_id TEXT,
      party_name TEXT NOT NULL,
      collection_date DATETIME NOT NULL,
      cash_paid REAL NOT NULL DEFAULT 0,
      bank_paid REAL NOT NULL DEFAULT 0,
      gpay_paid REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL,
      remarks TEXT,
      source_event_id TEXT NOT NULL UNIQUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS party_collections_party_id_idx ON party_collections (party_id)`,
    `CREATE INDEX IF NOT EXISTS party_collections_party_name_idx ON party_collections (party_name)`,
    `CREATE INDEX IF NOT EXISTS party_collections_collection_date_idx ON party_collections (collection_date)`,
    `CREATE TABLE IF NOT EXISTS party_payments (
      id TEXT PRIMARY KEY NOT NULL,
      party_id TEXT,
      party_name TEXT NOT NULL,
      payment_date DATETIME NOT NULL,
      cash_paid REAL NOT NULL DEFAULT 0,
      bank_paid REAL NOT NULL DEFAULT 0,
      gpay_paid REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL,
      remarks TEXT,
      source_event_id TEXT NOT NULL UNIQUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS party_payments_party_id_idx ON party_payments (party_id)`,
    `CREATE INDEX IF NOT EXISTS party_payments_party_name_idx ON party_payments (party_name)`,
    `CREATE INDEX IF NOT EXISTS party_payments_payment_date_idx ON party_payments (payment_date)`,
    `CREATE TABLE IF NOT EXISTS party_ledger (
      id TEXT PRIMARY KEY NOT NULL,
      party_id TEXT,
      party_name TEXT NOT NULL,
      date DATETIME NOT NULL,
      type TEXT NOT NULL,
      ref_id TEXT NOT NULL,
      description TEXT NOT NULL,
      debit_amount REAL NOT NULL DEFAULT 0,
      credit_amount REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS party_ledger_party_id_idx ON party_ledger (party_id)`,
    `CREATE INDEX IF NOT EXISTS party_ledger_party_name_idx ON party_ledger (party_name)`,
    `CREATE INDEX IF NOT EXISTS party_ledger_date_idx ON party_ledger (date)`,
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
    `CREATE TABLE IF NOT EXISTS other_credits (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT,
      expected_due_date DATETIME,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS outgoing_sales_sale_date_idx ON outgoing_sales (sale_date)`,
    `CREATE INDEX IF NOT EXISTS outgoing_sales_vehicle_number_idx ON outgoing_sales (vehicle_number)`,
    `CREATE INDEX IF NOT EXISTS outgoing_sales_party_name_idx ON outgoing_sales (party_name)`,
    `CREATE INDEX IF NOT EXISTS incoming_boulder_date_idx ON incoming_boulder (date)`,
    `CREATE INDEX IF NOT EXISTS party_credit_party_name_idx ON party_credit (party_name)`,
    `CREATE INDEX IF NOT EXISTS party_credit_sale_id_idx ON party_credit (sale_id)`,
    // --- Tables added in later phases ---
    `CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY NOT NULL,
      expense_date DATETIME NOT NULL,
      expense_type TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_mode TEXT NOT NULL DEFAULT 'CASH',
      party_id TEXT,
      party_name TEXT,
      vehicle_id TEXT,
      vehicle_number TEXT,
      description TEXT,
      source_event_id TEXT NOT NULL UNIQUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS expenses_expense_date_idx ON expenses (expense_date)`,
    `CREATE INDEX IF NOT EXISTS expenses_party_id_idx ON expenses (party_id)`,
    `CREATE INDEX IF NOT EXISTS expenses_vehicle_id_idx ON expenses (vehicle_id)`,
    `CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE,
      phone TEXT,
      address TEXT,
      role TEXT NOT NULL DEFAULT 'STAFF',
      balance REAL NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS employee_ledgers (
      id TEXT PRIMARY KEY NOT NULL,
      employee_id TEXT NOT NULL,
      date DATETIME NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      balance REAL NOT NULL,
      description TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS employee_ledgers_employee_id_idx ON employee_ledgers (employee_id)`,
    `CREATE INDEX IF NOT EXISTS employee_ledgers_date_idx ON employee_ledgers (date)`,
    `CREATE TABLE IF NOT EXISTS fuel_purchases (
      id TEXT PRIMARY KEY NOT NULL,
      date DATETIME NOT NULL,
      fuel_type TEXT NOT NULL DEFAULT 'DIESEL',
      price_per_litre REAL,
      qty_litre REAL,
      amount REAL NOT NULL,
      paid_amount REAL NOT NULL DEFAULT 0,
      credit_amount REAL NOT NULL DEFAULT 0,
      is_can BOOLEAN NOT NULL DEFAULT false,
      vehicle_id TEXT,
      vehicle_number TEXT,
      source_event_id TEXT NOT NULL UNIQUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS fuel_purchases_date_idx ON fuel_purchases (date)`,
    `CREATE INDEX IF NOT EXISTS fuel_purchases_vehicle_id_idx ON fuel_purchases (vehicle_id)`,
    `CREATE TABLE IF NOT EXISTS cash_transfers (
      id TEXT PRIMARY KEY NOT NULL,
      date DATETIME NOT NULL,
      time TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      user_name TEXT NOT NULL,
      remarks TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS cash_transfers_date_idx ON cash_transfers (date)`,
    `CREATE TABLE IF NOT EXISTS global_settings (
      id TEXT PRIMARY KEY NOT NULL DEFAULT 'default',
      quarry_name TEXT NOT NULL DEFAULT 'MBM Quarry',
      gst_number TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      default_printer TEXT NOT NULL DEFAULT '',
      backup_folder TEXT NOT NULL DEFAULT '',
      admin_pin TEXT NOT NULL DEFAULT '8888',
      delete_pin TEXT NOT NULL DEFAULT '7711',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS sync_state (
      id TEXT PRIMARY KEY NOT NULL DEFAULT 'default',
      last_synced_at DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00',
      status TEXT NOT NULL DEFAULT 'IDLE',
      last_error TEXT,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  await ensureSQLiteColumn(prisma, "global_settings", "admin_pin", "TEXT NOT NULL DEFAULT '8888'");
  await ensureSQLiteColumn(prisma, "global_settings", "delete_pin", "TEXT NOT NULL DEFAULT '7711'");

  await ensureSQLiteColumn(prisma, "vehicles", "party_id", "TEXT");
  await ensureSQLiteColumn(prisma, "vehicles", "trip_count", "INTEGER NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "vehicles", "updated_at", "DATETIME");
  await ensureSQLiteColumn(prisma, "parties", "updated_at", "DATETIME");
  await ensureSQLiteColumn(prisma, "outgoing_sales", "vehicle_id", "TEXT");
  await ensureSQLiteColumn(prisma, "outgoing_sales", "party_id", "TEXT");
  await ensureSQLiteColumn(prisma, "outgoing_sales", "material_id", "TEXT");
  await ensureSQLiteColumn(prisma, "outgoing_sales", "original_qty", "REAL");
  await ensureSQLiteColumn(prisma, "outgoing_sales", "quantity_reason", "TEXT");
  await ensureSQLiteColumn(prisma, "outgoing_sales", "trip_delta", "INTEGER NOT NULL DEFAULT 1");
  await ensureSQLiteColumn(prisma, "outgoing_sales", "gpay_paid", "REAL NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "outgoing_sales", "paid_total", "REAL NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "outgoing_sales", "remaining_credit", "REAL NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "outgoing_sales", "book_number", "INTEGER");
  await ensureSQLiteColumn(prisma, "outgoing_sales", "page_number", "INTEGER");
  await ensureSQLiteColumn(prisma, "outgoing_sales", "updated_at", "DATETIME");
  // GST columns for outgoing_sales
  await ensureSQLiteColumn(prisma, "outgoing_sales", "gst_enabled", "BOOLEAN NOT NULL DEFAULT false");
  await ensureSQLiteColumn(prisma, "outgoing_sales", "gst_rate", "REAL NOT NULL DEFAULT 5");
  await ensureSQLiteColumn(prisma, "outgoing_sales", "sgst", "REAL NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "outgoing_sales", "cgst", "REAL NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "outgoing_sales", "gst_amount", "REAL NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "outgoing_sales", "discount_type", "TEXT NOT NULL DEFAULT 'fixed'");
  await ensureSQLiteColumn(prisma, "outgoing_sales", "discount_value", "REAL NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "incoming_boulder", "vehicle_id", "TEXT");
  await ensureSQLiteColumn(prisma, "incoming_boulder", "party_id", "TEXT");
  await ensureSQLiteColumn(prisma, "incoming_boulder", "material_id", "TEXT");
  await ensureSQLiteColumn(prisma, "incoming_boulder", "time", "TEXT");
  await ensureSQLiteColumn(prisma, "incoming_boulder", "rock_rate", "REAL NOT NULL DEFAULT 26");
  await ensureSQLiteColumn(prisma, "incoming_boulder", "amount", "REAL NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "incoming_boulder", "cash_paid", "REAL NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "incoming_boulder", "bank_paid", "REAL NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "incoming_boulder", "gpay_paid", "REAL NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "incoming_boulder", "paid_total", "REAL NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "incoming_boulder", "remaining_credit", "REAL NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "incoming_boulder", "settled", "BOOLEAN NOT NULL DEFAULT false");
  await ensureSQLiteColumn(prisma, "incoming_boulder", "vehicle_rent", "REAL NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "incoming_boulder", "combined_payment", "BOOLEAN NOT NULL DEFAULT false");
  await ensureSQLiteColumn(prisma, "incoming_boulder", "updated_at", "DATETIME");
  await ensureSQLiteColumn(prisma, "incoming_boulder", "book_number", "INTEGER");
  await ensureSQLiteColumn(prisma, "incoming_boulder", "page_number", "INTEGER");
  await ensureSQLiteColumn(prisma, "party_credit", "party_id", "TEXT");
  await ensureSQLiteColumn(prisma, "party_credit", "updated_at", "DATETIME");
  await ensureSQLiteColumn(prisma, "employee_credit", "updated_at", "DATETIME");
  await ensureSQLiteColumn(prisma, "other_credits", "updated_at", "DATETIME");

  await backfillSQLiteTimestamp(prisma, "vehicles", "updated_at");
  await backfillSQLiteTimestamp(prisma, "parties", "updated_at");
  await backfillSQLiteTimestamp(prisma, "outgoing_sales", "updated_at");
  await backfillSQLiteTimestamp(prisma, "incoming_boulder", "updated_at");
  await backfillSQLiteTimestamp(prisma, "party_credit", "updated_at");
  await backfillSQLiteTimestamp(prisma, "employee_credit", "updated_at");
  await backfillSQLiteTimestamp(prisma, "other_credits", "updated_at");

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

async function ensureSQLiteColumn(prisma: PrismaClient, tableName: string, columnName: string, columnDefinition: string) {
  const columns = (await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info(${tableName})`,
  )).map((row) => row.name);

  if (columns.includes(columnName)) return;

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${columnDefinition}`);
  } catch (err: any) {
    if (!err.message?.includes("duplicate column name")) {
      throw err;
    }
  }
}

async function backfillSQLiteTimestamp(prisma: PrismaClient, tableName: string, columnName: string) {
  await prisma.$executeRawUnsafe(
    `UPDATE "${tableName}" SET "${columnName}" = CURRENT_TIMESTAMP WHERE "${columnName}" IS NULL`,
  );
}
