// Fix 2: Reset the sync cursor to epoch so all logs are retried
const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '..', 'node_modules', '@prisma', 'client'));

async function main() {
  const dbPath = process.env.APPDATA + '\\mbm-quarry-erp\\quarry.db';
  const prisma = new PrismaClient({ datasourceUrl: `file:${dbPath}` });

  const before = await prisma.syncState.findFirst();
  console.log('BEFORE:', JSON.stringify(before, null, 2));

  await prisma.syncState.update({
    where: { id: 'default' },
    data: {
      lastSyncedAt: new Date(0),
      status: 'IDLE',
      lastError: null
    }
  });

  const after = await prisma.syncState.findFirst();
  console.log('\nAFTER:', JSON.stringify(after, null, 2));

  await prisma.$disconnect();
  console.log('\n✅ Sync cursor reset to epoch!');
}

main().catch(e => { console.error(e); process.exit(1); });
