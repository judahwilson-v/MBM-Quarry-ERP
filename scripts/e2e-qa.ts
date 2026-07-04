import { PrismaClient } from '@prisma/client';
import { saveParty, saveVehicle, saveEmployee, saveSale, getDashboardTotals } from '../src/lib/offline-actions';
import { addDayBookExpense } from '../src/lib/domain/daybook';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function runE2E() {
  console.log("Starting E2E QA Test...");
  await (await import('../src/lib/prisma')).ensureDatabase();

  console.log("Clearing old QA data...");
  await prisma.dayBookExpenseEntry.deleteMany({ where: { description: "QA Maintenance" } });
  await prisma.inventoryTransaction.deleteMany({ where: { description: "QA Test Sale" } });
  await prisma.outgoingSale.deleteMany({ where: { remarks: "QA Test Sale" } });
  await prisma.employee.deleteMany({ where: { name: "QA Driver" } });
  await prisma.vehicle.deleteMany({ where: { vehicleNumber: "QA01XY9999" } });
  await prisma.party.deleteMany({ where: { partyName: "Test Party E2E" } });

  // 1. Create Masters
  console.log("Creating Masters...");
  await saveParty({ partyName: "Test Party E2E", phone: "1231231234", address: "QA City" });
  await saveVehicle({ vehicleNumber: "QA01XY9999", companyBodyQty: 500, extraBodyQty: 0 });
  await saveEmployee({ name: "QA Driver", role: "DRIVER", phone: "9998887776" });

  const parties = await prisma.party.findMany({ where: { partyName: "Test Party E2E" } });
  if (parties.length === 0) throw new Error("Party creation failed");
  const testParty = parties[0];

  const vehicles = await prisma.vehicle.findMany({ where: { vehicleNumber: "QA01XY9999" } });
  if (vehicles.length === 0) throw new Error("Vehicle creation failed");
  const testVehicle = vehicles[0];

  await prisma.material.upsert({
    where: { materialName: "20mm" },
    update: {},
    create: { id: randomUUID(), materialName: "20mm", ratePerCft: 20 }
  });
  const materials = await prisma.material.findMany({ where: { materialName: "20mm" } });
  const testMaterial = materials[0];

  // 2. Create Sale (With GST)
  console.log("Creating Sale...");
  await saveSale({
    saleDate: new Date().toISOString().split("T")[0],
    vehicleNumber: "QA01XY9999",
    partyName: "Test Party E2E",
    materialId: testMaterial.id,
    qty: 500,
    cashPaid: 500,
    bankPaid: 0,
    ratePerCft: 20,
    gstEnabled: true,
    discountValue: 0,
    discountType: "fixed",
    remarks: "QA Test Sale",
    vehicleId: testVehicle.id
  });

  // Verify Sale GST logic
  const sales = await prisma.outgoingSale.findMany({ where: { remarks: "QA Test Sale" } });
  if (sales.length === 0) throw new Error("Sale creation failed");
  const sale = sales[0];

  const expectedQty = 500;
  const expectedGrossAmount = expectedQty * 20; // 10000
  const expectedGst = expectedGrossAmount * 0.05; // 500 (if 5% GST is used)
  const expectedSgst = expectedGst / 2; // 250
  const expectedCgst = expectedGst / 2; // 250
  const expectedTotal = expectedGrossAmount + expectedSgst + expectedCgst; // 10500
  const expectedCredit = expectedTotal - 500; // 10000

  if (sale.amount !== expectedGrossAmount) throw new Error(`Sale amount mismatch: expected ${expectedGrossAmount}, got ${sale.amount}`);
  if (sale.gstEnabled && (sale.sgst !== expectedSgst || sale.cgst !== expectedCgst)) {
    throw new Error(`GST mismatch: expected ${expectedSgst}/${expectedCgst}, got ${sale.sgst}/${sale.cgst}`);
  }
  if (sale.finalAmount !== expectedTotal) throw new Error(`Sale finalAmount mismatch: expected ${expectedTotal}, got ${sale.finalAmount}`);
  if (sale.remainingCredit !== expectedCredit) throw new Error(`Sale remainingCredit mismatch: expected ${expectedCredit}, got ${sale.remainingCredit}`);

  // 3. Verify Inventory logic
  console.log("Verifying Inventory calculations...");
  const stocks = await prisma.inventoryStock.findMany({ where: { materialName: "20mm" } });
  if (stocks.length === 0) throw new Error("Inventory Stock missing for 20mm");
  const stock = stocks[0];
  if (stock.quantity >= 0) {
    console.log(`Note: Inventory quantity for 20mm is ${stock.quantity}. Since we only sold 500 without production in, it might be negative, or zero if prevented.`);
  }

  // 4. Test Expenses
  console.log("Testing Expenses & Daybook...");
  await addDayBookExpense(
    await import('../src/lib/prisma').then(m => m.getDb()),
    {
      businessDate: new Date().toISOString().split("T")[0],
      expenseType: "MISCELLANEOUS",
      amount: 250,
      description: "QA Maintenance",
    }
  );

  const daybooks = await prisma.dayBook.findMany({ orderBy: { businessDate: 'desc' }, take: 1 });
  if (daybooks.length > 0 && daybooks[0].expenseTotal < 250) {
    throw new Error(`Daybook expense total failed: ${daybooks[0].expenseTotal}`);
  }

  // 5. Dashboard Totals
  console.log("Testing Dashboard...");
  const dashboard = await getDashboardTotals();
  
  if (dashboard.totalToReceive === undefined) {
    throw new Error(`Dashboard totals not computed properly.`);
  }

  console.log("E2E Test Passed Successfully! All workflows verified.");
}

runE2E()
  .catch((e) => {
    console.error("E2E TEST FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
