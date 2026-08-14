// Quick test: call getDetailedSyncStatus and print results
const path = require('path');

// Set up env before importing
process.env.DATABASE_URL = `file:${path.resolve(__dirname, '..', 'prisma', 'local.db')}`;
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://slgkzhchczgvfhryejqu.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_C6GqTBck3ecMAY-xO37RQA_-x6PYVZM';
process.env.SUPABASE_URL = 'https://slgkzhchczgvfhryejqu.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_C6GqTBck3ecMAY-xO37RQA_-x6PYVZM';

async function test() {
  // Direct Prisma test instead to avoid module resolution issues
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } }
  });

  const syncState = await prisma.syncState.findUnique({ where: { id: 'default' } });
  const pullState = await prisma.syncState.findUnique({ where: { id: 'pull_state' } });
  const pushCursor = syncState?.lastSyncedAt || new Date(0);

  console.log('=== DETAILED SYNC STATUS ===\n');
  console.log('Push cursor:', pushCursor.toISOString());
  console.log('Push status:', syncState?.status);
  console.log('Push error:', syncState?.lastError || 'None');
  console.log('Pull cursor:', pullState?.lastSyncedAt?.toISOString());
  console.log('Pull status:', pullState?.status);

  // Count pending per entity
  const pendingLogs = await prisma.auditLog.groupBy({
    by: ['entityName'],
    where: { createdAt: { gt: pushCursor } },
    _count: true,
    orderBy: { _count: { entityName: 'desc' } }
  });

  console.log('\n--- Pending by Entity ---');
  let total = 0;
  for (const entry of pendingLogs) {
    console.log(`  ${entry.entityName}: ${entry._count} pending`);
    total += entry._count;
  }
  console.log(`\n  TOTAL: ${total} pending\n`);

  // Check total audit logs
  const totalLogs = await prisma.auditLog.count();
  console.log(`Total audit logs in DB: ${totalLogs}`);

  await prisma.$disconnect();
}

test().catch(e => { console.error(e); process.exit(1); });
