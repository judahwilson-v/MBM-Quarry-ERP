// Compare local SQLite IDs vs remote Supabase IDs
const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '..', 'node_modules', '@prisma', 'client'));

const SUPABASE_URL = 'https://slgkzhchczgvfhryejqu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_C6GqTBck3ecMAY-xO37RQA_-x6PYVZM';

async function querySupabase(table, params = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  return res.json();
}

async function main() {
  const dbPath = process.env.APPDATA + '\\mbm-quarry-erp\\quarry.db';
  const prisma = new PrismaClient({ datasourceUrl: `file:${dbPath}` });

  // Get local sales
  const localSales = await prisma.outgoingSale.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
  console.log('=== LOCAL SALES (SQLite) ===');
  for (const s of localSales) {
    console.log(`Sale ${s.id}: vehicle=${s.vehicleId} party=${s.partyId} material=${s.materialId} (${s.vehicleNumber})`);
  }

  // Check if those IDs exist in remote Supabase
  if (localSales.length > 0) {
    const sale = localSales[0];
    console.log('\n=== CHECKING IF LOCAL FK IDs EXIST IN SUPABASE ===');
    
    const remoteVehicle = await querySupabase('vehicles', `id=eq.${sale.vehicleId}&select=id,vehicle_number`);
    console.log(`Vehicle ${sale.vehicleId}: ${remoteVehicle.length > 0 ? 'EXISTS -> ' + remoteVehicle[0].vehicle_number : '❌ MISSING!'}`);

    const remoteParty = await querySupabase('parties', `id=eq.${sale.partyId}&select=id,party_name`);
    console.log(`Party ${sale.partyId}: ${remoteParty.length > 0 ? 'EXISTS -> ' + remoteParty[0].party_name : '❌ MISSING!'}`);

    const remoteMaterial = await querySupabase('materials', `id=eq.${sale.materialId}&select=id,material_name`);
    console.log(`Material ${sale.materialId}: ${remoteMaterial.length > 0 ? 'EXISTS -> ' + remoteMaterial[0].material_name : '❌ MISSING!'}`);
  }

  // Check local sync state
  const syncState = await prisma.syncState.findFirst();
  console.log('\n=== LOCAL SYNC STATE ===');
  console.log(JSON.stringify(syncState, null, 2));

  // Count pending
  const totalAuditLogs = await prisma.auditLog.count();
  const pendingAuditLogs = syncState?.lastSyncedAt 
    ? await prisma.auditLog.count({ where: { createdAt: { gt: syncState.lastSyncedAt } } })
    : totalAuditLogs;
  console.log(`\nTotal audit logs: ${totalAuditLogs}`);
  console.log(`Pending audit logs: ${pendingAuditLogs}`);
  
  // Show the pending audit logs
  const pendingLogs = await prisma.auditLog.findMany({
    where: syncState?.lastSyncedAt ? { createdAt: { gt: syncState.lastSyncedAt } } : undefined,
    orderBy: { createdAt: 'asc' },
    take: 30,
    select: { id: true, entityName: true, entityId: true, action: true, createdAt: true }
  });
  console.log('\nPending Audit Log entries:');
  for (const log of pendingLogs) {
    console.log(`  [${log.action}] ${log.entityName} ${log.entityId} @ ${log.createdAt.toISOString()}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
