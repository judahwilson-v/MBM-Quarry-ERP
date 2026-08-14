const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TABLE "global_settings" ADD COLUMN "enable_weighbridge" BOOLEAN NOT NULL DEFAULT 0`).catch(e => {
    if (!e.message.includes('duplicate column name')) throw e;
  });
  await prisma.$executeRawUnsafe(`ALTER TABLE "global_settings" ADD COLUMN "enable_fleet_maintenance" BOOLEAN NOT NULL DEFAULT 0`).catch(e => {
    if (!e.message.includes('duplicate column name')) throw e;
  });
  await prisma.$executeRawUnsafe(`ALTER TABLE "global_settings" ADD COLUMN "enable_customer_portal" BOOLEAN NOT NULL DEFAULT 0`).catch(e => {
    if (!e.message.includes('duplicate column name')) throw e;
  });
  await prisma.$executeRawUnsafe(`ALTER TABLE "global_settings" ADD COLUMN "enable_credit_locks" BOOLEAN NOT NULL DEFAULT 0`).catch(e => {
    if (!e.message.includes('duplicate column name')) throw e;
  });
  console.log("Columns added successfully!");
}

main().finally(() => prisma.$disconnect());
