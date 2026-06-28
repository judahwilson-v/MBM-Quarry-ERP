const path = require('path');
const fs = require('fs');

async function migrate() {
  const standaloneDir = __dirname;
  const prismaPath = path.join(standaloneDir, 'node_modules', '@prisma', 'client');
  
  if (!fs.existsSync(prismaPath)) {
    console.error('[Migrate] Prisma Client not found at', prismaPath);
    return;
  }

  const { PrismaClient } = require(prismaPath);
  
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });

  console.log('[Migrate] Connecting to database:', process.env.DATABASE_URL);

  try {
    // 1. Add time column to party_ledger if missing
    console.log('[Migrate] Checking party_ledger schema...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "party_ledger" ADD COLUMN "time" TEXT;`);
    console.log('[Migrate] Successfully added time column to party_ledger.');
  } catch (err) {
    if (!err.message?.includes('duplicate column name') && !err.message?.includes('duplicate column')) {
      console.error('[Migrate] Error adding time column:', err.message);
      process.exit(1);
    }
  }

  await prisma.$disconnect();
  console.log('[Migrate] Database auto-migration completed.');
}

migrate().catch(console.error);
