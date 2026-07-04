import { PrismaClient } from '@prisma/client';
import { ensureDatabase } from '../src/lib/prisma';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  await ensureDatabase();

  console.log("Seeding dummy data...");

  const parties = ['Alpha Builders', 'Omega Constructions', 'City Projects Co'];
  for (const p of parties) {
    await prisma.party.upsert({
      where: { partyName: p },
      update: {},
      create: {
        id: randomUUID(),
        partyName: p,
        phone: '9876543210',
        address: 'Downtown, City',
      }
    });
  }

  const vehicles = ['KA01AB1234', 'TN02CD5678', 'MH03EF9012'];
  for (const v of vehicles) {
    await prisma.vehicle.upsert({
      where: { vehicleNumber: v },
      update: {},
      create: {
        id: randomUUID(),
        vehicleNumber: v,
        companyBodyQty: 500,
        extraBodyQty: 0,
      }
    });
  }

  const employees = ['Ramesh', 'Suresh', 'John'];
  for (const e of employees) {
    await prisma.employee.upsert({
      where: { name: e },
      update: {},
      create: {
        id: randomUUID(),
        name: e,
        phone: '1234567890',
        role: 'DRIVER'
      }
    });
  }

  console.log("Dummy data seeded successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
