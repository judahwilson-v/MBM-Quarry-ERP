import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Starting Phase 10 Seeding...");

  // PHASE 10: Seed suppliers
  const suppliers = [
    'Qsand',
    'Silver Storm',
    'Asif' // Also mentioned in personal data as a supplier of boulder
  ];

  for (const name of suppliers) {
    // We insert them into Party because IncomingBoulder references Party
    await prisma.party.upsert({
      where: { partyName: name },
      update: {},
      create: { partyName: name }
    });
    console.log(`Seeded supplier party: ${name}`);
    
    // And also into Supplier table if it's being used anywhere else
    await prisma.supplier.upsert({
      where: { supplierName: name },
      update: {},
      create: { supplierName: name }
    });
    console.log(`Seeded dedicated supplier: ${name}`);
  }

  console.log("Phase 10 Seeding complete!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
