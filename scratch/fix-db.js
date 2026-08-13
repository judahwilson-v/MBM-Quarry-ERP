const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
  const sql = fs.readFileSync('migrate.sql', 'utf8');
  const commands = sql.split(';').filter(cmd => cmd.trim().length > 0);
  for (const cmd of commands) {
    if (cmd.trim().startsWith('--')) continue;
    try {
      console.log('Executing:', cmd.trim());
      await prisma.$executeRawUnsafe(cmd.trim());
    } catch (e) {
      console.error('Failed:', e.message);
    }
  }
}

main().finally(() => prisma.$disconnect());
