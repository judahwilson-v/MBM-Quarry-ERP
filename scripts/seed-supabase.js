/**
 * One-time script to push all local seed data to Supabase.
 * 
 * Run: node scripts/seed-supabase.js
 * 
 * This reads parties, vehicles, employees, suppliers, and materials
 * from the local SQLite DB and upserts them into Supabase.
 */

const { createClient } = require("@supabase/supabase-js");
const { PrismaClient } = require("@prisma/client");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const prisma = new PrismaClient();

function toSnakeCase(obj) {
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (obj !== null && typeof obj === "object") {
    return Object.keys(obj).reduce((result, key) => {
      const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      result[snakeKey] = toSnakeCase(obj[key]);
      return result;
    }, {});
  }
  return obj;
}

async function pushTable(tableName, delegate, label) {
  const rows = await delegate.findMany();
  if (rows.length === 0) {
    console.log(`[${label}] No rows to push.`);
    return 0;
  }
  let count = 0;
  for (const row of rows) {
    const snakeRow = toSnakeCase(row);
    const { error } = await supabase.from(tableName).upsert(snakeRow);
    if (error) {
      console.error(`[${label}] Error upserting ${snakeRow.id}: ${error.message}`);
    } else {
      count++;
    }
  }
  console.log(`[${label}] Pushed ${count}/${rows.length} rows.`);
  return count;
}

async function main() {
  console.log("=== Seed Supabase Push ===\n");

  await pushTable("parties", prisma.party, "Parties");
  await pushTable("vehicles", prisma.vehicle, "Vehicles");
  await pushTable("employees", prisma.employee, "Employees");
  await pushTable("suppliers", prisma.supplier, "Suppliers");
  await pushTable("materials", prisma.material, "Materials");

  console.log("\n=== Done ===");
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
