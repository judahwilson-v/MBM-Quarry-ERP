import { PrismaClient } from '@prisma/client';
import { ensureDatabase } from '../src/lib/prisma';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  await ensureDatabase();

  console.log("Database initialized. No dummy data seeded (removed for production safety).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
