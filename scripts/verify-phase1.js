// Phase 1 Verification Script
// Tests the migration runner against the legacy backup database
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

async function verify() {
  console.log('\n=== PHASE 1 VERIFICATION ===\n');
  
  const db = new PrismaClient();

  // Test 1: Check schema_migrations table
  console.log('--- Test 1: schema_migrations populated ---');
  try {
    const migs = await db.$queryRawUnsafe("SELECT id, version, checksum FROM schema_migrations ORDER BY version");
    if (migs.length === 0) {
      console.log('  ❌ FAIL: schema_migrations is empty — migrations did not run');
    } else {
      console.log(`  ✅ PASS: ${migs.length} migration(s) recorded`);
      migs.forEach(m => console.log(`     v${m.version}: ${m.id} (checksum: ${m.checksum})`));
    }
  } catch (e) {
    console.log(`  ❌ FAIL: ${e.message}`);
  }

  // Test 2: Check weighbridge_tickets has ticket_type (not ticketType)
  console.log('\n--- Test 2: weighbridge_tickets column name ---');
  try {
    const cols = await db.$queryRawUnsafe('PRAGMA table_info("weighbridge_tickets")');
    const colNames = cols.map(c => c.name);
    const hasTicketType = colNames.includes('ticketType');
    const hasTicket_type = colNames.includes('ticket_type');
    
    if (hasTicket_type && !hasTicketType) {
      console.log('  ✅ PASS: ticket_type (snake_case) exists, ticketType (camelCase) gone');
    } else if (hasTicket_type && hasTicketType) {
      console.log('  ⚠️ PARTIAL: Both columns exist (expected if State C applied)');
    } else if (hasTicketType && !hasTicket_type) {
      console.log('  ❌ FAIL: ticketType still exists, ticket_type NOT created');
    } else {
      console.log('  ❌ FAIL: Neither column exists');
    }
  } catch (e) {
    console.log(`  ❌ FAIL: ${e.message}`);
  }

  // Test 3: Count weighbridge_tickets rows (should be 65)
  console.log('\n--- Test 3: weighbridge_tickets data preserved ---');
  try {
    const cnt = await db.$queryRawUnsafe("SELECT COUNT(*) as cnt FROM weighbridge_tickets");
    const count = Number(cnt[0].cnt);
    if (count === 65) {
      console.log(`  ✅ PASS: ${count} rows preserved (expected 65)`);
    } else if (count > 0) {
      console.log(`  ⚠️ WARN: ${count} rows (expected 65 — may differ if data changed)`);
    } else {
      console.log(`  ❌ FAIL: 0 rows — data was lost!`);
    }
  } catch (e) {
    console.log(`  ❌ FAIL: ${e.message}`);
  }

  // Test 4: All 32 Prisma model tables exist
  console.log('\n--- Test 4: All model tables exist ---');
  const expectedTables = [
    'vehicles', 'parties', 'materials', 'outgoing_sales', 'financial_events',
    'ledger_entries', 'day_books', 'day_book_expense_entries', 'incoming_boulder',
    'party_credit', 'party_collections', 'party_ledger', 'cash_transfers',
    'party_payments', 'employee_credit', 'suppliers', 'day_book_entries',
    'audit_logs', 'roles', 'other_credits', 'expenses', 'employees',
    'employee_ledgers', 'fuel_purchases', 'sync_state', 'global_settings',
    'inventory_stock', 'inventory_transactions', 'weighbridge_tickets',
    'maintenance_records', 'maintenance_schedules', 'vehicle_stats'
  ];
  try {
    const tables = await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const tableNames = tables.map(t => t.name.toLowerCase());
    const missing = expectedTables.filter(t => !tableNames.includes(t));
    if (missing.length === 0) {
      console.log(`  ✅ PASS: All 32 model tables exist`);
    } else {
      console.log(`  ❌ FAIL: Missing tables: ${missing.join(', ')}`);
    }
  } catch (e) {
    console.log(`  ❌ FAIL: ${e.message}`);
  }

  // Test 5: Row counts for business tables (no data loss)
  console.log('\n--- Test 5: Business data row counts ---');
  const criticalTables = {
    outgoing_sales: 19,
    parties: 44, // at minimum (seed data may increase)
    vehicles: 216,
    employees: 17,
    weighbridge_tickets: 65,
    financial_events: 39,
    materials: 11,
  };
  for (const [table, expected] of Object.entries(criticalTables)) {
    try {
      const cnt = await db.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM "${table}"`);
      const actual = Number(cnt[0].cnt);
      if (actual >= expected) {
        console.log(`  ✅ ${table}: ${actual} rows (expected ≥${expected})`);
      } else {
        console.log(`  ❌ ${table}: ${actual} rows (expected ≥${expected}) — DATA LOSS!`);
      }
    } catch (e) {
      console.log(`  ❌ ${table}: ERROR ${e.message}`);
    }
  }

  // Test 6: Prisma can query weighbridge_tickets (the previously broken table)
  console.log('\n--- Test 6: Prisma can query weighbridge_tickets ---');
  try {
    const tickets = await db.weighbridgeTicket.findMany({ take: 1 });
    console.log(`  ✅ PASS: Prisma queried weighbridge_tickets successfully (got ${tickets.length} row(s))`);
    if (tickets.length > 0) {
      console.log(`     First ticket type: "${tickets[0].ticketType}"`);
    }
  } catch (e) {
    console.log(`  ❌ FAIL: Prisma query failed — ${e.message}`);
  }

  await db.$disconnect();
  console.log('\n=== VERIFICATION COMPLETE ===\n');
}

verify().catch(e => { console.error(e); process.exit(1); });
