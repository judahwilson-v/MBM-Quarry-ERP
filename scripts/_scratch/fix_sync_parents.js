// Fix sync: Force-push parent records to Supabase
// Run from project root: cmd /c npx tsx scratch/fix_sync_parents.js

const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const path = require('path');

const SUPABASE_URL = 'https://slgkzhchczgvfhryejqu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_C6GqTBck3ecMAY-xO37RQA_-x6PYVZM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const dbPath = path.resolve(__dirname, '..', 'prisma', 'local.db');
const prisma = new PrismaClient({
  datasources: { db: { url: `file:${dbPath}` } }
});

async function main() {
  console.log('=== SYNC DIAGNOSTIC REPORT ===\n');

  // 1. Check sync state
  const syncState = await prisma.syncState.findUnique({ where: { id: 'default' } });
  console.log('Push cursor:', syncState?.lastSyncedAt);
  console.log('Push status:', syncState?.status);
  console.log('Push error:', syncState?.lastError || 'None');

  // 2. Count pending
  const pushCursor = syncState?.lastSyncedAt || new Date(0);
  const pendingLogs = await prisma.auditLog.count({ where: { createdAt: { gt: pushCursor } } });
  console.log(`\nPending audit logs: ${pendingLogs}`);

  // 3. Check Supabase parent tables
  const parentTables = ['parties', 'vehicles', 'materials', 'suppliers', 'employees'];
  console.log('\n--- Supabase counts ---');
  for (const table of parentTables) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    console.log(`  ${table}: ${error ? 'ERROR: ' + error.message : count}`);
  }

  // 4. Force-push parents
  console.log('\n--- Pushing parties ---');
  const parties = await prisma.party.findMany();
  for (const p of parties) {
    const { error } = await supabase.from('parties').upsert({
      id: p.id, party_name: p.partyName, party_type: p.partyType,
      phone: p.phone, address: p.address, opening_balance: p.openingBalance,
      created_at: p.createdAt?.toISOString(), updated_at: p.updatedAt?.toISOString(),
    });
    if (error) console.log(`  ERR: ${p.partyName}: ${error.message}`);
  }
  console.log(`  Done: ${parties.length} parties`);

  console.log('--- Pushing vehicles ---');
  const vehicles = await prisma.vehicle.findMany();
  for (const v of vehicles) {
    const { error } = await supabase.from('vehicles').upsert({
      id: v.id, vehicle_number: v.vehicleNumber, vehicle_type: v.vehicleType,
      party_id: v.partyId, is_own: v.isOwn,
      created_at: v.createdAt?.toISOString(), updated_at: v.updatedAt?.toISOString(),
    });
    if (error) console.log(`  ERR: ${v.vehicleNumber}: ${error.message}`);
  }
  console.log(`  Done: ${vehicles.length} vehicles`);

  console.log('--- Pushing materials ---');
  const materials = await prisma.material.findMany();
  for (const m of materials) {
    const { error } = await supabase.from('materials').upsert({
      id: m.id, material_name: m.materialName, rate: m.rate,
      unit: m.unit, gst_rate: m.gstRate,
      created_at: m.createdAt?.toISOString(), updated_at: m.updatedAt?.toISOString(),
    }, { onConflict: 'material_name' });
    if (error) console.log(`  ERR: ${m.materialName}: ${error.message}`);
  }
  console.log(`  Done: ${materials.length} materials`);

  console.log('--- Pushing suppliers ---');
  const suppliers = await prisma.supplier.findMany();
  for (const s of suppliers) {
    const { error } = await supabase.from('suppliers').upsert({
      id: s.id, supplier_name: s.supplierName, phone: s.phone, address: s.address,
      created_at: s.createdAt?.toISOString(), updated_at: s.updatedAt?.toISOString(),
    }, { onConflict: 'supplier_name' });
    if (error) console.log(`  ERR: ${s.supplierName}: ${error.message}`);
  }
  console.log(`  Done: ${suppliers.length} suppliers`);

  console.log('--- Pushing employees ---');
  const employees = await prisma.employee.findMany();
  for (const e of employees) {
    const { error } = await supabase.from('employees').upsert({
      id: e.id, name: e.name, phone: e.phone, role: e.role,
      salary: e.salary, opening_balance: e.openingBalance, is_active: e.isActive,
      created_at: e.createdAt?.toISOString(), updated_at: e.updatedAt?.toISOString(),
    }, { onConflict: 'name' });
    if (error) console.log(`  ERR: ${e.name}: ${error.message}`);
  }
  console.log(`  Done: ${employees.length} employees`);

  // 5. Verify
  console.log('\n--- Counts after fix ---');
  for (const table of parentTables) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
    console.log(`  ${table}: ${count}`);
  }

  console.log('\n=== PARENT RECORDS FIXED. Now click Sync Now in the app! ===');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
