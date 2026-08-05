import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  const count = await prisma.vehicle.count();
  console.log(`Found ${count} vehicles.`);
  
  const res = await prisma.vehicle.deleteMany({});
  console.log(`Deleted ${res.count} vehicles from the directory.`);
  
  const countAfter = await prisma.vehicle.count();
  console.log(`Vehicles remaining: ${countAfter}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    process.exit(0);
  });
