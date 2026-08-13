const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const state = await prisma.syncState.findMany();
  console.log(JSON.stringify(state, null, 2));
}

main().finally(() => prisma.$disconnect());
