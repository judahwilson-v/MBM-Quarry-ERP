import { PrismaClient, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

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

// [vehicleNumber, companyBodyQty | null, extraBodyQty | null, vehicleType | null]
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
  // MBM-owned equipment
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

export async function initializeDatabase(prisma: PrismaClient) {
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
      vehicle_type TEXT,
      trip_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS parties (
      id TEXT PRIMARY KEY NOT NULL,
      party_name TEXT NOT NULL UNIQUE,
      phone TEXT,
      address TEXT,
      party_group TEXT,
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
      serial_number INTEGER UNIQUE,
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
      time TEXT,
      type TEXT NOT NULL,
      ref_id TEXT NOT NULL,
      description TEXT NOT NULL,
      payment_method TEXT,
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
    `CREATE TABLE IF NOT EXISTS inventory_stock (
      id TEXT PRIMARY KEY NOT NULL,
      material_name TEXT NOT NULL UNIQUE,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'TONS',
      last_updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_transactions (
      id TEXT PRIMARY KEY NOT NULL,
      stock_id TEXT NOT NULL,
      date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      type TEXT NOT NULL,
      quantity_change REAL NOT NULL,
      reference_id TEXT,
      description TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS inventory_transactions_stock_id_idx ON inventory_transactions (stock_id)`,
    `CREATE INDEX IF NOT EXISTS inventory_transactions_date_idx ON inventory_transactions (date)`,
    `CREATE TABLE IF NOT EXISTS weighbridge_tickets (
      id TEXT PRIMARY KEY NOT NULL,
      ticket_number INTEGER NOT NULL UNIQUE,
      vehicle_number TEXT NOT NULL,
      vehicle_id TEXT,
      party_id TEXT,
      material_id TEXT,
      ticketType TEXT NOT NULL DEFAULT 'OUTGOING',
      status TEXT NOT NULL DEFAULT 'FIRST_WEIGHT',
      gross_weight REAL,
      gross_time DATETIME,
      tare_weight REAL,
      tare_time DATETIME,
      net_weight REAL,
      linked_sale_id TEXT UNIQUE,
      linked_boulder_id TEXT UNIQUE,
      remarks TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS weighbridge_tickets_vehicle_number_idx ON weighbridge_tickets (vehicle_number)`,
    `CREATE INDEX IF NOT EXISTS weighbridge_tickets_status_idx ON weighbridge_tickets (status)`,
    // --- Fleet Maintenance tables (added v1.11.2) ---
    `CREATE TABLE IF NOT EXISTS maintenance_records (
      id TEXT PRIMARY KEY NOT NULL,
      vehicle_id TEXT NOT NULL,
      date DATETIME NOT NULL,
      engine_hours REAL NOT NULL,
      service_type TEXT NOT NULL,
      description TEXT,
      cost REAL NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS maintenance_records_vehicle_id_idx ON maintenance_records (vehicle_id)`,
    `CREATE INDEX IF NOT EXISTS maintenance_records_date_idx ON maintenance_records (date)`,
    `CREATE TABLE IF NOT EXISTS maintenance_schedules (
      id TEXT PRIMARY KEY NOT NULL,
      vehicle_id TEXT NOT NULL,
      service_type TEXT NOT NULL,
      interval_hours REAL,
      interval_days INTEGER,
      next_due_hours REAL,
      next_due_date DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS maintenance_schedules_vehicle_id_idx ON maintenance_schedules (vehicle_id)`,
    `CREATE TABLE IF NOT EXISTS vehicle_stats (
      id TEXT PRIMARY KEY NOT NULL,
      vehicle_id TEXT NOT NULL UNIQUE,
      engine_hours REAL NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    )`
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  await ensureSQLiteColumn(prisma, "global_settings", "admin_pin", "TEXT NOT NULL DEFAULT '8888'");
  await ensureSQLiteColumn(prisma, "global_settings", "delete_pin", "TEXT NOT NULL DEFAULT '7711'");
  
  // Feature flags
  await ensureSQLiteColumn(prisma, "global_settings", "enable_weighbridge", "BOOLEAN NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "global_settings", "enable_fleet_maintenance", "BOOLEAN NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "global_settings", "enable_customer_portal", "BOOLEAN NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "global_settings", "enable_credit_locks", "BOOLEAN NOT NULL DEFAULT 0");

  await ensureSQLiteColumn(prisma, "vehicles", "party_id", "TEXT");
  await ensureSQLiteColumn(prisma, "vehicles", "trip_count", "INTEGER NOT NULL DEFAULT 0");
  await ensureSQLiteColumn(prisma, "vehicles", "updated_at", "DATETIME");
  await ensureSQLiteColumn(prisma, "vehicles", "vehicle_type", "TEXT");
  await ensureSQLiteColumn(prisma, "parties", "updated_at", "DATETIME");
  await ensureSQLiteColumn(prisma, "parties", "party_group", "TEXT");
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

  await verifySchemaSync(prisma);
}

async function verifySchemaSync(prisma: PrismaClient) {
  const result = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type='table'"
  );
  const existingTables = result.map(r => r.name.toLowerCase());
  
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
    console.error("The following tables exist in schema.prisma but were not created in bootstrap.ts:");
    console.error(missingTables.join(", "));
    console.error("Please add the raw CREATE TABLE statements to src/lib/bootstrap.ts!");
    console.error("==========================================");
    // In dev, we might throw. In production, we definitely throw so the developer catches it before shipping.
    throw new Error(`Schema Desync: Missing tables in SQLite database: ${missingTables.join(", ")}`);
  } else {
    console.log("[Bootstrap] Schema sync verified successfully. All Prisma models match SQLite tables.");
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
