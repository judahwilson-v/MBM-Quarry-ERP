import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Starting Phase 6, 7, 8 Seeding...");

  // PHASE 7: Fix material rates
  console.log("Phase 7: Fixing material rates...");
  const materials = [
    { name: '20mm', rate: 40 },
    { name: 'MSand', rate: 45 }
  ];

  for (const mat of materials) {
    const existing = await prisma.material.findUnique({
      where: { materialName: mat.name }
    });
    if (existing) {
      await prisma.material.update({
        where: { id: existing.id },
        data: { ratePerCft: mat.rate }
      });
      console.log(`Updated material ${mat.name} to ₹${mat.rate}`);
    } else {
      await prisma.material.create({
        data: { materialName: mat.name, ratePerCft: mat.rate }
      });
      console.log(`Created material ${mat.name} at ₹${mat.rate}`);
    }
  }

  // PHASE 6: Seed 15 employees
  console.log("Phase 6: Seeding employees...");
  const employees = [
    { name: 'Sundareswaran. K', role: 'GM' },
    { name: 'Lathesh', role: 'Accounts' },
    { name: 'Sujith', role: 'Supervisor' },
    { name: 'Shiva Kumar', role: 'Store Keeper' },
    { name: 'Sandeep', role: 'Excavator / JCB Manager' },
    { name: 'Pradeep', role: 'Excavator Operator' },
    { name: 'Jayan', role: 'Primary Driver' },
    { name: 'Vijai', role: 'Welder' },
    { name: 'Vasu', role: 'General' },
    { name: 'Manir Bhai', role: 'Multi-purpose' },
    { name: 'Sasi', role: 'Primary crusher operator' },
    { name: 'Manoj', role: 'General worker' },
    { name: 'Swaminatham', role: 'Loading' },
    { name: 'Balan', role: 'Pickup driver' },
    { name: 'Kumari', role: 'Kitchen Cook' }
  ];

  for (const emp of employees) {
    await prisma.employee.upsert({
      where: { name: emp.name },
      update: { role: emp.role },
      create: { name: emp.name, role: emp.role, balance: 0 }
    });
    console.log(`Seeded employee: ${emp.name} (${emp.role})`);
  }

  // PHASE 8: MBM-owned equipment
  console.log("Phase 8: Seeding MBM-owned equipment...");
  const vehicles = [
    { vehicleNumber: 'MAHINDRA BOLERO', vehicleType: 'CAR' },
    { vehicleNumber: 'TATA TRUCK KL36B7092', vehicleType: 'TRUCK' },
    { vehicleNumber: 'JCB KL17J5911', vehicleType: 'MACHINERY' },
    { vehicleNumber: 'HERO HONDA PASSION PRO', vehicleType: 'BIKE' }
  ];

  for (const veh of vehicles) {
    // Normalize vehicle number to match the application's normalizeVehicleNumber format
    const normalized = veh.vehicleNumber.trim().replace(/\s+/g, " ").toUpperCase();
    await prisma.vehicle.upsert({
      where: { vehicleNumber: normalized },
      update: { vehicleType: veh.vehicleType },
      create: { vehicleNumber: normalized, vehicleType: veh.vehicleType }
    });
    console.log(`Seeded vehicle: ${normalized} (${veh.vehicleType})`);
  }

  console.log("Seeding complete!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
