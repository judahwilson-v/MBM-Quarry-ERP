const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const parties = await prisma.party.findMany({
    where: { partyName: { in: ['Alpha Builders', 'Omega Constructions', 'City Projects Co'] } }
  });
  console.log('Parties:', parties.length);
  
  const vehicles = await prisma.vehicle.findMany({
    where: { vehicleNumber: { in: ['KA01AB1234', 'TN02CD5678', 'MH03EF9012'] } }
  });
  console.log('Vehicles:', vehicles.length);
  
  const employees = await prisma.employee.findMany({
    where: { name: { in: ['Ramesh', 'Suresh', 'John'] } }
  });
  console.log('Employees:', employees.length);
}

main().finally(() => prisma.$disconnect());
