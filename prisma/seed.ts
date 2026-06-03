import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const materials: Array<{ name: string; code: string; currentRate: string; reorderLevel: string }> = [
  { name: "6mm", code: "6MM", currentRate: "40", reorderLevel: "400" },
  { name: "20mm", code: "20MM", currentRate: "36", reorderLevel: "400" },
  { name: "40mm", code: "40MM", currentRate: "34", reorderLevel: "400" },
  { name: "M-Sand", code: "MSAND", currentRate: "45", reorderLevel: "500" },
  { name: "P-Sand", code: "PSAND", currentRate: "42", reorderLevel: "500" },
  { name: "Dust", code: "DUST", currentRate: "30", reorderLevel: "300" },
  { name: "GSB", code: "GSB", currentRate: "32", reorderLevel: "300" },
  { name: "PS", code: "PS", currentRate: "30", reorderLevel: "300" },
];

async function main() {
  const password = await bcrypt.hash("changeme123", 12);

  await prisma.user.upsert({
    where: { email: "admin@mbm.com" },
    update: {
      name: "MBM Owner",
      role: Role.OWNER,
      isActive: true,
      mustChangePassword: true,
    },
    create: {
      name: "MBM Owner",
      email: "admin@mbm.com",
      password,
      role: Role.OWNER,
      isActive: true,
      mustChangePassword: true,
    },
  });

  for (const material of materials) {
    await prisma.material.upsert({
      where: { code: material.code },
      update: {
        name: material.name,
        unit: "CFT",
        currentRate: material.currentRate,
        reorderLevel: material.reorderLevel,
        isActive: true,
      },
      create: {
        name: material.name,
        code: material.code,
        unit: "CFT",
        currentRate: material.currentRate,
        currentStock: "0",
        reorderLevel: material.reorderLevel,
        isActive: true,
      },
    });
  }

  await prisma.party.upsert({
    where: { id: "walk-in-customer" },
    update: {
      name: "Walk-in Customer",
      isActive: true,
      deletedAt: null,
    },
    create: {
      id: "walk-in-customer",
      name: "Walk-in Customer",
      isActive: true,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
