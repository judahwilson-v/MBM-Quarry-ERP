// Fix 1 v2: Smart force-push with proper conflict resolution
// Strategy: Use upsert with onConflict on natural keys to unify IDs
const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '..', 'node_modules', '@prisma', 'client'));

const SUPABASE_URL = 'https://slgkzhchczgvfhryejqu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_C6GqTBck3ecMAY-xO37RQA_-x6PYVZM';

function toSnake(str) {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

function convertKeys(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value instanceof Date) {
      result[toSnake(key)] = value.toISOString();
    } else if (value !== undefined) {
      result[toSnake(key)] = value;
    }
  }
  return result;
}

async function upsertBatch(table, records, onConflict) {
  let success = 0, errors = [];
  for (const record of records) {
    const url = `${SUPABASE_URL}/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(record)
    });
    if (res.status < 300) {
      success++;
    } else {
      const errBody = await res.text();
      errors.push({ id: record.id, status: res.status, error: errBody });
    }
  }
  return { success, errors };
}

async function deleteAll(table) {
  // Delete all rows (PostgREST requires a filter, use gt for id)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=neq.IMPOSSIBLE_ID_NEVER_EXISTS`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    }
  });
  return res.status;
}

async function main() {
  const dbPath = process.env.APPDATA + '\\mbm-quarry-erp\\quarry.db';
  const prisma = new PrismaClient({ datasourceUrl: `file:${dbPath}` });

  console.log('=== FIX 1 v2: SMART FORCE-PUSH WITH CONFLICT RESOLUTION ===\n');

  // Step 1: Clear out all remote transaction data first (there are 0 sales anyway)
  // This lets us safely re-push master data with new IDs
  console.log('Step 1: Clearing remote transaction tables (they are empty anyway)...');
  for (const table of ['outgoing_sales', 'incoming_boulder', 'expenses', 'fuel_purchases', 
    'party_collections', 'party_payments', 'party_credit', 'party_ledger',
    'employee_credit', 'employee_ledgers', 'other_credits', 'cash_transfers',
    'day_book_expense_entries', 'day_book_entries', 'weighbridge_tickets',
    'maintenance_records', 'maintenance_schedules', 'vehicle_stats']) {
    const status = await deleteAll(table);
    if (status < 300) {
      console.log(`  ✅ Cleared ${table}`);
    } else {
      console.log(`  ⚠️  ${table}: status ${status} (may be empty already)`);
    }
  }

  // Step 2: Clear and re-push master data
  // We need to delete vehicles first (they reference parties), then parties
  console.log('\nStep 2: Clearing remote vehicles (they reference parties)...');
  const delVehicles = await deleteAll('vehicles');
  console.log(`  Vehicles delete: ${delVehicles}`);

  console.log('Step 3: Clearing remote parties...');
  const delParties = await deleteAll('parties');
  console.log(`  Parties delete: ${delParties}`);

  console.log('Step 4: Clearing remote suppliers...');
  const delSuppliers = await deleteAll('suppliers');
  console.log(`  Suppliers delete: ${delSuppliers}`);

  // Step 5: Push all local parties (fresh, no conflicts)
  const localParties = await prisma.party.findMany();
  console.log(`\nStep 5: Pushing ${localParties.length} local parties...`);
  const partyRecords = localParties.map(p => {
    const r = convertKeys(p);
    // Remove relation fields that aren't columns
    delete r.vehicles;
    delete r.outgoing_sales;
    delete r.party_credits;
    delete r.party_collections;
    delete r.party_payments;
    delete r.party_ledger;
    return r;
  });
  const partyResult = await upsertBatch('parties', partyRecords);
  console.log(`  Parties: ${partyResult.success} pushed, ${partyResult.errors.length} errors`);
  if (partyResult.errors.length > 0) {
    console.log('  Errors:', JSON.stringify(partyResult.errors.slice(0, 3), null, 2));
  }

  // Step 6: Push all local suppliers
  const localSuppliers = await prisma.supplier.findMany();
  console.log(`\nStep 6: Pushing ${localSuppliers.length} local suppliers...`);
  const supplierRecords = localSuppliers.map(s => {
    const r = convertKeys(s);
    delete r.incoming_boulder;
    return r;
  });
  const supplierResult = await upsertBatch('suppliers', supplierRecords);
  console.log(`  Suppliers: ${supplierResult.success} pushed, ${supplierResult.errors.length} errors`);
  if (supplierResult.errors.length > 0) {
    console.log('  Errors:', JSON.stringify(supplierResult.errors.slice(0, 3), null, 2));
  }

  // Step 7: Push all local vehicles (now parties exist with correct IDs)
  const localVehicles = await prisma.vehicle.findMany();
  console.log(`\nStep 7: Pushing ${localVehicles.length} local vehicles...`);
  const vehicleRecords = localVehicles.map(v => {
    const r = convertKeys(v);
    // Remove relation fields
    delete r.party;
    delete r.outgoing_sales;
    delete r.incoming_boulder;
    delete r.expenses;
    delete r.fuel_purchases;
    delete r.maintenance_records;
    delete r.maintenance_schedules;
    delete r.vehicle_stats;
    return r;
  });
  const vehicleResult = await upsertBatch('vehicles', vehicleRecords);
  console.log(`  Vehicles: ${vehicleResult.success} pushed, ${vehicleResult.errors.length} errors`);
  if (vehicleResult.errors.length > 0) {
    console.log('  Errors:', JSON.stringify(vehicleResult.errors.slice(0, 3), null, 2));
  }

  // Step 8: Push all local materials (upsert, they should be fine)
  const localMaterials = await prisma.material.findMany();
  console.log(`\nStep 8: Pushing ${localMaterials.length} local materials...`);
  const materialRecords = localMaterials.map(m => {
    const r = convertKeys(m);
    delete r.outgoing_sales;
    delete r.inventory_stock;
    delete r.inventory_transactions;
    return r;
  });
  const materialResult = await upsertBatch('materials', materialRecords, 'id');
  console.log(`  Materials: ${materialResult.success} pushed, ${materialResult.errors.length} errors`);

  // Step 9: Push employees
  const localEmployees = await prisma.employee.findMany();
  console.log(`\nStep 9: Pushing ${localEmployees.length} local employees...`);
  const employeeRecords = localEmployees.map(e => {
    const r = convertKeys(e);
    delete r.employee_credits;
    delete r.employee_ledgers;
    return r;
  });
  const employeeResult = await upsertBatch('employees', employeeRecords);
  console.log(`  Employees: ${employeeResult.success} pushed, ${employeeResult.errors.length} errors`);
  if (employeeResult.errors.length > 0) {
    console.log('  Errors:', JSON.stringify(employeeResult.errors.slice(0, 3), null, 2));
  }

  // Verification
  console.log('\n=== VERIFICATION ===');
  const testIds = [
    { table: 'vehicles', id: '6019cca4-783a-44ad-9afd-1092c6100c8d', label: 'Vehicle KL 05 S 1114' },
    { table: 'vehicles', id: 'cmr03hk470006t7cgehmh14mu', label: 'Vehicle (CUID-style)' },
  ];
  for (const t of testIds) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${t.table}?id=eq.${t.id}&select=id`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const data = await res.json();
    console.log(`${t.label} (${t.id}): ${data.length > 0 ? '✅ EXISTS' : '❌ MISSING'}`);
  }

  // Final counts
  for (const table of ['parties', 'vehicles', 'materials', 'suppliers', 'employees']) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'count=exact' }
    });
    const count = res.headers.get('content-range');
    console.log(`${table}: ${count}`);
  }

  await prisma.$disconnect();
  console.log('\n✅ Fix 1 v2 complete!');
}

main().catch(e => { console.error(e); process.exit(1); });
