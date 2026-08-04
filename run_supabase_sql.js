const { Client } = require('pg');

async function run() {
  const connectionString = 'postgresql://postgres:judahvijaiwilson@db.slgkzhchczgvfhryejqu.supabase.co:5432/postgres';
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to Supabase PostgreSQL.");

    // Run the ALTER TABLE from Phase 1
    console.log("Adding feature flags to global_settings...");
    try {
      await client.query(`
        ALTER TABLE global_settings 
        ADD COLUMN enable_weighbridge BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN enable_fleet_maintenance BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN enable_customer_portal BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN enable_credit_locks BOOLEAN NOT NULL DEFAULT false;
      `);
      console.log("Successfully altered global_settings.");
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log("global_settings columns already exist.");
      } else {
        throw e;
      }
    }

    // Run the CREATE TABLE for weighbridge_tickets
    console.log("Creating weighbridge_tickets table...");
    await client.query(`
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
        gross_time TIMESTAMPTZ,
        tare_weight REAL,
        tare_time TIMESTAMPTZ,
        net_weight REAL,
        linked_sale_id TEXT UNIQUE,
        linked_boulder_id TEXT UNIQUE,
        remarks TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await client.query(`CREATE INDEX IF NOT EXISTS weighbridge_tickets_vehicle_number_idx ON weighbridge_tickets (vehicle_number);`);
    await client.query(`CREATE INDEX IF NOT EXISTS weighbridge_tickets_status_idx ON weighbridge_tickets (status);`);
    console.log("Successfully created weighbridge_tickets table and indexes.");

  } catch (err) {
    console.error("Error executing queries:", err.message);
  } finally {
    await client.end();
  }
}

run();
