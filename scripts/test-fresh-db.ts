// Fresh database test: create a brand new database and run migrations
import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";

const freshDbPath = path.resolve(__dirname, "..", "prisma", "test-fresh.db");

async function testFreshDb() {
  console.log("\n=== FRESH DATABASE TEST ===\n");

  // Delete any existing test database
  if (fs.existsSync(freshDbPath)) {
    fs.unlinkSync(freshDbPath);
    console.log("[Fresh] Deleted existing test-fresh.db");
  }

  // Set DATABASE_URL to the fresh database
  process.env.DATABASE_URL = `file:${freshDbPath.replace(/\\/g, "/")}`;
  console.log(`[Fresh] Using: ${process.env.DATABASE_URL}`);

  // Force a new Prisma client instance
  const db = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });

  // Import and run the bootstrap
  const { initializeDatabase } = await import("../src/lib/bootstrap");

  try {
    await initializeDatabase(db);
    console.log("[Fresh] initializeDatabase completed!");
  } catch (e) {
    console.error("[Fresh] FAILED:", e instanceof Error ? e.message : String(e));
    await db.$disconnect();
    process.exit(1);
  }

  // Verify
  const migs = await db.$queryRawUnsafe<Array<{ id: string; version: number }>>(
    "SELECT id, version FROM schema_migrations ORDER BY version"
  );
  console.log(`[Fresh] ${migs.length} migration(s) recorded`);

  const tables = await db.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  );
  console.log(`[Fresh] ${tables.length} tables created`);

  // Check weighbridge_tickets column
  const cols = await db.$queryRawUnsafe<Array<{ name: string }>>(
    'PRAGMA table_info("weighbridge_tickets")'
  );
  const hasTicketType = cols.some((c: { name: string }) => c.name === "ticketType");
  const hasTicket_type = cols.some((c: { name: string }) => c.name === "ticket_type");
  console.log(`[Fresh] ticket_type: ${hasTicket_type}, ticketType: ${hasTicketType}`);

  if (hasTicket_type && !hasTicketType) {
    console.log("[Fresh] ✅ PASS: Fresh database created correctly");
  } else {
    console.log("[Fresh] ❌ FAIL: Column naming issue");
  }

  await db.$disconnect();

  // Cleanup
  if (fs.existsSync(freshDbPath)) {
    fs.unlinkSync(freshDbPath);
    console.log("[Fresh] Cleaned up test-fresh.db");
  }

  console.log("\n=== FRESH DATABASE TEST COMPLETE ===\n");
}

testFreshDb().catch((e) => {
  console.error(e);
  process.exit(1);
});
