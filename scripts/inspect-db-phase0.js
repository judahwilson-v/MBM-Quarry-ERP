// Phase 0 forensics: inspect actual SQLite database using Prisma's engine
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  // 1. List all tables
  const tables = await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log(`\n--- TABLES (${tables.length}) ---`);
  tables.forEach(t => console.log(`  ${t.name}`));

  // 2. weighbridge_tickets columns
  try {
    const cols = await db.$queryRawUnsafe('PRAGMA table_info("weighbridge_tickets")');
    console.log(`\n--- WEIGHBRIDGE_TICKETS (${cols.length} columns) ---`);
    const hasTicketType = cols.some(c => c.name === 'ticketType');
    const hasTicket_type = cols.some(c => c.name === 'ticket_type');
    console.log(`  ticketType (camelCase): ${hasTicketType}`);
    console.log(`  ticket_type (snake_case): ${hasTicket_type}`);
    cols.forEach(c => console.log(`  ${c.name} | ${c.type} | nullable=${!c.notnull} | pk=${c.pk} | default=${c.dflt_value}`));
  } catch (e) {
    console.log(`\n--- WEIGHBRIDGE_TICKETS: table does not exist ---`);
  }

  // 3. All table column details
  console.log(`\n--- FULL COLUMN INVENTORY ---`);
  for (const t of tables) {
    if (t.name.startsWith('_') || t.name === 'sqlite_sequence') continue;
    try {
      const cols = await db.$queryRawUnsafe(`PRAGMA table_info("${t.name}")`);
      console.log(`\nTable: ${t.name} (${cols.length} cols)`);
      cols.forEach(c => console.log(`  ${c.name} | ${c.type} | notnull=${c.notnull} | pk=${c.pk} | default=${c.dflt_value}`));
    } catch (e) {
      console.log(`  ${t.name}: ERROR ${e.message}`);
    }
  }

  // 4. schema_migrations
  try {
    const migs = await db.$queryRawUnsafe("SELECT * FROM schema_migrations ORDER BY version");
    console.log(`\n--- SCHEMA_MIGRATIONS (${migs.length}) ---`);
    migs.forEach(m => console.log(`  v${m.version}: ${m.id} (applied: ${m.applied_at})`));
  } catch (e) {
    console.log(`\n--- SCHEMA_MIGRATIONS: ${e.message?.includes('no such table') ? 'table does not exist' : e.message} ---`);
  }

  // 5. _prisma_migrations
  try {
    const migs = await db.$queryRawUnsafe("SELECT migration_name, finished_at, applied_steps_count FROM _prisma_migrations ORDER BY finished_at");
    console.log(`\n--- _PRISMA_MIGRATIONS (${migs.length}) ---`);
    migs.forEach(m => console.log(`  ${m.migration_name} | finished: ${m.finished_at} | steps: ${m.applied_steps_count}`));
  } catch (e) {
    console.log(`\n--- _PRISMA_MIGRATIONS: ${e.message?.includes('no such table') ? 'table does not exist' : e.message} ---`);
  }

  // 6. serial_number analysis
  try {
    const total = await db.$queryRawUnsafe("SELECT COUNT(*) as cnt FROM outgoing_sales");
    const nulls = await db.$queryRawUnsafe("SELECT COUNT(*) as cnt FROM outgoing_sales WHERE serial_number IS NULL");
    console.log(`\n--- OUTGOING_SALES SERIAL_NUMBER ---`);
    console.log(`  Total rows: ${total[0].cnt}`);
    console.log(`  serial_number IS NULL: ${nulls[0].cnt}`);
  } catch (e) {
    console.log(`\n--- OUTGOING_SALES: ${e.message} ---`);
  }

  // 7. Row counts
  console.log(`\n--- ROW COUNTS ---`);
  for (const t of tables) {
    if (t.name.startsWith('_') || t.name === 'sqlite_sequence') continue;
    try {
      const cnt = await db.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM "${t.name}"`);
      console.log(`  ${t.name}: ${cnt[0].cnt}`);
    } catch (e) {
      console.log(`  ${t.name}: ERROR`);
    }
  }

  // 8. Indexes
  console.log(`\n--- INDEXES ---`);
  const indexes = await db.$queryRawUnsafe("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY tbl_name, name");
  indexes.forEach(idx => console.log(`  ${idx.tbl_name}.${idx.name}`));

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
