const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS weighbridge_tickets (
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
    )
  `);
  
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS weighbridge_tickets_vehicle_number_idx ON weighbridge_tickets (vehicle_number)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS weighbridge_tickets_status_idx ON weighbridge_tickets (status)`);
  
  console.log("Weighbridge table created successfully!");
}

main().finally(() => prisma.$disconnect());
