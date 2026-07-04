import { PrismaClient } from "@prisma/client";
import { saveSale, deleteSale, saveIncomingBoulder, deleteIncomingBoulder, savePartyCollection, deletePartyCollection, savePartyPayment, deletePartyPayment } from "../src/lib/offline-actions";

const prisma = new PrismaClient();
const STRESS_ITERATIONS = 50;

async function setup() {
  console.log("Setting up master data...");
  await prisma.inventoryTransaction.deleteMany();
  await prisma.inventoryStock.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.dayBookExpenseEntry.deleteMany();
  await prisma.financialEvent.deleteMany();
  await prisma.partyCollection.deleteMany();
  await prisma.partyPayment.deleteMany();
  await prisma.outgoingSale.deleteMany();
  await prisma.incomingBoulder.deleteMany();
  await prisma.partyLedger.deleteMany();
  await prisma.dayBook.deleteMany();
  await prisma.party.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.material.deleteMany();

  const parties = [];
  for (let i = 1; i <= 5; i++) {
    parties.push(await prisma.party.create({ data: { partyName: `Dummy Party ${i}`, phone: "12345", address: "Local" } }));
  }

  const vehicles = [];
  for (let i = 1; i <= 5; i++) {
    vehicles.push(await prisma.vehicle.create({ data: { vehicleNumber: `TN-01-XX-000${i}` } }));
  }

  const materials = [];
  materials.push(await prisma.material.create({ data: { materialName: "ROCK" } }));
  materials.push(await prisma.material.create({ data: { materialName: "SAND" } }));

  return { parties, vehicles, materials };
}

function rand(arr: any[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function runStress() {
  const { parties, vehicles, materials } = await setup();
  const TEST_DATE = new Date().toISOString().split("T")[0];
  
  const createdSaleIds: string[] = [];
  const createdBoulderIds: string[] = [];
  const createdCollectionIds: string[] = [];
  const createdPaymentIds: string[] = [];

  console.log(`Starting ${STRESS_ITERATIONS} random operations...`);
  
  for (let i = 0; i < STRESS_ITERATIONS; i++) {
    const op = Math.random();
    try {
      if (op < 0.25) { // Create Sale
        const party = rand(parties);
        const vehicle = rand(vehicles);
        const material = rand(materials);
        const saleData = {
          date: TEST_DATE,
          time: "12:00",
          vehicleNumber: vehicle.vehicleNumber,
          partyName: party.partyName,
          materialId: material.id,
          qty: "100",
          quantityReason: "Stress test",
          discountType: "NONE" as any,
          discountValue: "0",
          ratePerCft: "10",
          amount: "1000",
          cashPaid: "500",
          bankPaid: "0",
          gPayPaid: "0"
        };
        const sale = await saveSale(saleData);
        createdSaleIds.push(sale.id);
        console.log(`[${i}] Created Sale: ${sale.id}`);
      } else if (op < 0.35 && createdSaleIds.length > 0) { // Delete Sale
        const id = rand(createdSaleIds);
        await deleteSale(id);
        createdSaleIds.splice(createdSaleIds.indexOf(id), 1);
        console.log(`[${i}] Deleted Sale: ${id}`);
      } else if (op < 0.5) { // Create Boulder
        const party = rand(parties);
        const vehicle = rand(vehicles);
        const boulderData = {
          date: TEST_DATE,
          vehicleNumber: vehicle.vehicleNumber,
          partyName: party.partyName,
          qty: "10",
          rockRate: "500",
          vehicleRent: "100",
          cashPaid: "5000",
          bankPaid: "0",
          gPayPaid: "0"
        };
        const boulder = await saveIncomingBoulder(boulderData);
        createdBoulderIds.push(boulder.id);
        console.log(`[${i}] Created Boulder: ${boulder.id}`);
      } else if (op < 0.6 && createdBoulderIds.length > 0) { // Delete Boulder
        const id = rand(createdBoulderIds);
        await deleteIncomingBoulder(id);
        createdBoulderIds.splice(createdBoulderIds.indexOf(id), 1);
        console.log(`[${i}] Deleted Boulder: ${id}`);
      } else if (op < 0.75) { // Collection
        const party = rand(parties);
        const col = await savePartyCollection({
          collectionDate: TEST_DATE,
          partyName: party.partyName,
          cashPaid: "1000",
          remarks: "Stress collection"
        });
        createdCollectionIds.push(col.id);
        console.log(`[${i}] Created Collection: ${col.id}`);
      } else if (op < 0.85 && createdCollectionIds.length > 0) { // Delete Collection
        const id = rand(createdCollectionIds);
        await deletePartyCollection(id);
        createdCollectionIds.splice(createdCollectionIds.indexOf(id), 1);
        console.log(`[${i}] Deleted Collection: ${id}`);
      } else if (op < 0.95) { // Payment
        const party = rand(parties);
        const pay = await savePartyPayment({
          paymentDate: TEST_DATE,
          partyName: party.partyName,
          cashPaid: "1000",
          remarks: "Stress payment"
        });
        createdPaymentIds.push(pay.id);
        console.log(`[${i}] Created Payment: ${pay.id}`);
      } else if (createdPaymentIds.length > 0) { // Delete Payment
        const id = rand(createdPaymentIds);
        await deletePartyPayment(id);
        createdPaymentIds.splice(createdPaymentIds.indexOf(id), 1);
        console.log(`[${i}] Deleted Payment: ${id}`);
      }
    } catch (e: any) {
      console.error(`Error on iteration ${i}:`, e.message);
    }
  }

  console.log("Stress test complete. Validating Invariants...");
  await validateInvariants(TEST_DATE);
}

async function validateInvariants(dateStr: string) {
  let hasErrors = false;
  const error = (msg: string) => {
    console.error("❌ " + msg);
    hasErrors = true;
  };

  const dayBooks = await prisma.dayBook.findMany();
  for (const db of dayBooks) {
    const sales = await prisma.ledgerEntry.findMany({ where: { entryDate: db.businessDate, eventType: "SALE_CREATED" } });
    const cashTotal = sales.reduce((sum, s) => sum + s.cashAmount, 0);
    
    if (db.cashSalesTotal !== cashTotal) {
      error(`DayBook cashSalesTotal (${db.cashSalesTotal}) does not match LedgerEntry sum (${cashTotal})`);
    } else {
      console.log(`✅ DayBook cashSalesTotal matches LedgerEntry sum (${cashTotal})`);
    }
  }

  // Check orphans
  const ledgers = await prisma.ledgerEntry.findMany();
  for (const l of ledgers) {
    const fe = await prisma.financialEvent.findUnique({ where: { eventId: l.financialEventId } });
    if (!fe) {
      error(`Orphan LedgerEntry ${l.id} - missing FinancialEvent ${l.financialEventId}`);
    }
  }

  const events = await prisma.financialEvent.findMany();
  for (const fe of events) {
    if (fe.entityType === "Sale") {
      const sale = await prisma.outgoingSale.findUnique({ where: { id: fe.entityId } });
      if (!sale) error(`Orphan FinancialEvent ${fe.eventId} - missing Sale ${fe.entityId}`);
    } else if (fe.entityType === "IncomingBoulder") {
      const b = await prisma.incomingBoulder.findUnique({ where: { id: fe.entityId } });
      if (!b) error(`Orphan FinancialEvent ${fe.eventId} - missing Boulder ${fe.entityId}`);
    } else if (fe.entityType === "PartyCollection") {
      const c = await prisma.partyCollection.findUnique({ where: { id: fe.entityId } });
      if (!c) error(`Orphan FinancialEvent ${fe.eventId} - missing Collection ${fe.entityId}`);
    } else if (fe.entityType === "PartyPayment") {
      const p = await prisma.partyPayment.findUnique({ where: { id: fe.entityId } });
      if (!p) error(`Orphan FinancialEvent ${fe.eventId} - missing Payment ${fe.entityId}`);
    }
  }

  const expenses = await prisma.dayBookExpenseEntry.findMany();
  for (const ex of expenses) {
    const fe = await prisma.financialEvent.findUnique({ where: { eventId: ex.sourceEventId } });
    if (!fe) {
      error(`Orphan DayBookExpenseEntry ${ex.id} - missing FinancialEvent ${ex.sourceEventId}`);
    }
  }

  if (!hasErrors) {
    console.log("🎉 All invariants passed successfully! No data corruption detected.");
  } else {
    console.log("💥 Invariants FAILED.");
    process.exit(1);
  }
}

runStress().catch(e => {
  console.error(e);
  process.exit(1);
});
