import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Purging dummy data from database...");
  
  const dummyParties = ['Alpha Builders', 'Omega Constructions', 'City Projects Co'];
  const partiesResult = await prisma.party.deleteMany({
    where: { partyName: { in: dummyParties } }
  });
  console.log(`Deleted ${partiesResult.count} dummy parties.`);
  
  const dummyVehicles = ['KA01AB1234', 'TN02CD5678', 'MH03EF9012'];
  const vehiclesResult = await prisma.vehicle.deleteMany({
    where: { vehicleNumber: { in: dummyVehicles } }
  });
  console.log(`Deleted ${vehiclesResult.count} dummy vehicles.`);
  
  const dummyEmployees = ['Ramesh', 'Suresh', 'John'];
  const employeesResult = await prisma.employee.deleteMany({
    where: { name: { in: dummyEmployees } }
  });
  console.log(`Deleted ${employeesResult.count} dummy employees.`);
  
  console.log("Purge complete.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
