import { getDb } from "../src/lib/prisma";
import {
  saveParty,
  saveSale,
  saveIncomingBoulder,
  savePartyCollection,
  saveDayBookOpeningBalances,
  saveDayBookExpense,
  rebuildBusinessDayBook
} from "../src/lib/offline-actions";

const extractedPartyNames = [
  "Vijayalakshmi", "Anugraha", "Prasad", "Jayadevan", "Mani", "Suresh", "Faraz", "Nishad",
  "Kazim", "Prasanth KMP", "Co stone", "Industrial Estate", "Asif", "Sunil", "Abbey",
  "Fathima", "Dark stone", "Pump - Ambalapara", "Prabash", "Myna", "Narayanankutty",
  "Bijoy", "Manohar"
];

const openingBalances = [
  { name: "Local", amount: 106000 },
  { name: "Usha", amount: 11000 },
  { name: "P.S - Son", amount: 25000 },
  { name: "Muthu", amount: 2000 },
  { name: "Auto Kannan Wife", amount: 2800 },
  { name: "Radha Vayu", amount: 8000 },
  { name: "Suresh (P)", amount: 460 },
  { name: "Auto Kannan Bthr", amount: 3050 },
  { name: "Kumakam", amount: 12000 },
  { name: "P.S", amount: 10000 },
  { name: "Sundaran", amount: 38730 },
  { name: "Latheeb", amount: 40500 },
  { name: "Sujith", amount: 7210 },
  { name: "Seytu", amount: 40850 },
  { name: "Sivakumar", amount: 2500 },
  { name: "Hane", amount: 40640 },
  { name: "S A", amount: 2000 },
  { name: "Salim", amount: 13350 },
  { name: "HB Claunder", amount: 10000 },
  { name: "Sujith W/s", amount: 71340 },
  { name: "Vinu", amount: 8700 },
  { name: "Balan", amount: 5220 },
  { name: "Pradeep", amount: 7800 },
  { name: "Sasi Clt", amount: 34770 },
  { name: "Auto Dhanin", amount: 4940 },
  { name: "Sandeep", amount: 11000 },
  { name: "Chanya", amount: 7460 },
  { name: "M/s Manthdu", amount: 17550 },
  { name: "Jiyon", amount: 8500 },
  { name: "Sasi Caly", amount: 6400 },
  { name: "Poolacaly", amount: 21630 }
];

const boulderPurchases = [
  { date: "2023-10-14", supplier: "Balan", loads: 2, amount: 4000 },
  { date: "2023-10-15", supplier: "Balan", loads: 3, amount: 6000 },
  { date: "2023-10-16", supplier: "Balan", loads: 1, amount: 2000 },
  { date: "2023-10-17", supplier: "Balan", loads: 4, amount: 8000 },
  { date: "2023-10-18", supplier: "Balan", loads: 2, amount: 4000 },
  { date: "2023-10-19", supplier: "Balan", loads: 2, amount: 4000 },
  { date: "2023-10-20", supplier: "Balan", loads: 3, amount: 6000 }
];

const salesEntries = [
  { date: "2023-10-14", customer: "Mani", loads: 1, amount: 1500 },
  { date: "2023-10-14", customer: "Suresh", loads: 2, amount: 3000 },
  { date: "2023-10-15", customer: "Faraz", loads: 1, amount: 1500 },
  { date: "2023-10-15", customer: "Nishad", loads: 1, amount: 1500 },
  { date: "2023-10-16", customer: "Kazim", loads: 2, amount: 3000 },
  { date: "2023-10-16", customer: "Prasanth KMP", loads: 3, amount: 4500 },
  { date: "2023-10-17", customer: "Mani", loads: 1, amount: 1500 },
  { date: "2023-10-18", customer: "Suresh", loads: 2, amount: 3000 },
  { date: "2023-10-19", customer: "Faraz", loads: 1, amount: 1500 },
  { date: "2023-10-20", customer: "Nishad", loads: 2, amount: 3000 }
];

const dayBookDate = "2024-01-03";
const dayBookOpening = 69650;
const collections = [
  { party: "Babu S A", amount: 400 },
  { party: "Sujith", amount: 1000 }
];
const payments = [
  { party: "S A", amount: 1000 },
  { party: "Hane", amount: 13000 },
  { party: "Sundaran", amount: 11000 },
  { party: "P.S - Son", amount: 10000 },
  { party: "Latheeb", amount: 10000 },
  { party: "Rabeeb", amount: 10000 },
  { party: "Sivakumar", amount: 500 }
];
const expenses = [
  { type: "MISCELLANEOUS", desc: "Tea (Expense)", amount: 130 }
];

async function main() {
  const db = await getDb();

  console.log("Cleaning up previous run data...");
  const obNames = openingBalances.map(ob => ob.name);
  const customerNames = salesEntries.map(s => s.customer);
  const cleanNames = Array.from(new Set([...obNames, ...customerNames]));

  // Clean standard credit and sale records for these names
  await db.partyCollection.deleteMany({ where: { partyName: { in: cleanNames } } });
  await db.partyCredit.deleteMany({ where: { partyName: { in: cleanNames } } });
  await db.outgoingSale.deleteMany({ where: { partyName: { in: cleanNames } } });
  await db.party.deleteMany({ where: { partyName: { in: cleanNames } } });

  // Clean Day Book date entries
  await db.dayBookExpenseEntry.deleteMany({ where: { entryDate: new Date(`${dayBookDate}T00:00:00`) } });
  await db.dayBook.deleteMany({ where: { businessDate: new Date(`${dayBookDate}T00:00:00`) } });

  // Clean OtherCredit
  await db.otherCredit.deleteMany();

  console.log("Creating default materials...");
  const obMaterialName = "OPENING BALANCE";
  const uncategorizedMaterialName = "RAW SALE";
  
  let obMat = await db.material.findUnique({ where: { materialName: obMaterialName } });
  if (!obMat) {
    obMat = await db.material.create({ data: { materialName: obMaterialName, ratePerCft: 1 } });
  }

  let rawMat = await db.material.findUnique({ where: { materialName: uncategorizedMaterialName } });
  if (!rawMat) {
    rawMat = await db.material.create({ data: { materialName: uncategorizedMaterialName, ratePerCft: 1 } });
  }

  console.log("Seeding Extracted Party Names...");
  for (const name of extractedPartyNames) {
    const p = await db.party.findFirst({ where: { partyName: name } });
    if (!p) await saveParty({ partyName: name });
  }

  console.log("Seeding Opening Balances into OtherCredit...");
  for (const ob of openingBalances) {
    await db.otherCredit.create({
      data: {
        name: ob.name,
        amount: ob.amount,
        status: "pending",
        reason: "Imported historical credit ledger balance"
      }
    });
  }

  console.log("Seeding Boulder Purchases...");
  for (const p of boulderPurchases) {
    await saveIncomingBoulder({
      date: p.date,
      vehicleNumber: `RAW-${p.loads}L`,
      partyName: p.supplier,
      qty: p.loads,
      rockRate: 26,
      remarks: `Total value ₹${p.amount}`
    });
  }

  console.log("Seeding Sales Ledger...");
  for (const s of salesEntries) {
    try {
      await saveSale({
        saleDate: s.date,
        vehicleNumber: `SALE-${s.loads}L`,
        partyName: s.customer,
        materialId: rawMat.id,
        qty: s.loads,
        ratePerCft: s.amount / s.loads,
        discountType: "fixed",
        discountValue: 0,
        remarks: "Imported from blue ledger"
      });
    } catch (e: any) {
      console.warn(`Failed Sale for ${s.customer}: ${e.message}`);
    }
  }

  console.log("Seeding Day Book...");
  // Set opening balance
  await saveDayBookOpeningBalances({
    businessDate: dayBookDate,
    openingCashBalance: dayBookOpening,
    openingBankBalance: 0
  });

  // Since some parties like Babu S A might not exist, make sure they do before collection.
  for (const c of collections) {
    const p = await db.party.findFirst({ where: { partyName: c.party } });
    if (!p) await saveParty({ partyName: c.party });
    
    // First, give them an opening balance to collect against, otherwise the strict system blocks it.
    await saveSale({
        saleDate: "2024-01-01",
        vehicleNumber: "PRE-COLLECT",
        partyName: c.party,
        materialId: obMat.id,
        qty: 1,
        ratePerCft: c.amount,
        discountType: "fixed",
        discountValue: 0,
        remarks: "Pre-collection balance setup"
    });
    
    await savePartyCollection({
      partyName: c.party,
      collectionDate: dayBookDate,
      cashPaid: c.amount,
      remarks: "Imported from Day Book Inflows"
    });
  }

  // Record payments to parties as miscellaneous expenses since our Collection system doesn't allow reverse (negative) collections right now.
  for (const p of payments) {
    await saveDayBookExpense({
      businessDate: dayBookDate,
      expenseType: "MISCELLANEOUS",
      amount: p.amount,
      description: `Payment to ${p.party}`
    });
  }

  // Record actual expenses
  for (const e of expenses) {
    await saveDayBookExpense({
      businessDate: dayBookDate,
      expenseType: e.type as any,
      amount: e.amount,
      description: e.desc
    });
  }

  // Rebuild Day Book
  await rebuildBusinessDayBook(dayBookDate);

  console.log("Seed completely successfully!");
}

main().catch(console.error);
