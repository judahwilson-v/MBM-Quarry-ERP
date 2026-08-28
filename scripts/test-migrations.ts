// Minimal test: run the bootstrap initializeDatabase function
// This will trigger the migration runner against the local database

async function main() {
  // Dynamically import to ensure TypeScript compilation via tsx
  const { getDb } = await import("../src/lib/prisma");

  console.log("[Test] Calling getDb() to trigger initializeDatabase...");
  const db = await getDb();
  console.log("[Test] initializeDatabase completed successfully!");

  // Quick verification
  const migs = await db.$queryRawUnsafe<Array<{ id: string; version: number; checksum: string }>>(
    "SELECT id, version, checksum FROM schema_migrations ORDER BY version"
  );
  console.log(`[Test] schema_migrations has ${migs.length} migration(s):`);
  for (const m of migs) {
    console.log(`  v${m.version}: ${m.id} (checksum: ${m.checksum})`);
  }

  // Check ticket_type column
  const cols = await db.$queryRawUnsafe<Array<{ name: string }>>(
    'PRAGMA table_info("weighbridge_tickets")'
  );
  const colNames = cols.map((c: { name: string }) => c.name);
  console.log(`[Test] weighbridge_tickets has ticket_type: ${colNames.includes("ticket_type")}`);
  console.log(`[Test] weighbridge_tickets has ticketType:  ${colNames.includes("ticketType")}`);

  // Try Prisma query
  try {
    const ticket = await db.weighbridgeTicket.findFirst();
    console.log("[Test] Prisma weighbridgeTicket.findFirst() succeeded!");
    if (ticket) {
      console.log(`[Test]   ticketType value: "${ticket.ticketType}"`);
    }
  } catch (e: unknown) {
    console.log(`[Test] Prisma weighbridgeTicket.findFirst() FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error("[Test] FATAL:", e);
  process.exit(1);
});
