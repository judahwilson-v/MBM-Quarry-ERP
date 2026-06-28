import { getDb } from "@/lib/prisma";

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dayKey(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

export async function getReportData() {
  const db = await getDb();
  const [sales, boulders, dayBooks, collections, partyCredits, vehicles, parties, dayBookExpenses] =
    await Promise.all([
      db.outgoingSale.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          saleDate: true,
          bookNumber: true,
          pageNumber: true,
          vehicleNumber: true,
          partyName: true,
          materialName: true,
          qty: true,
          amount: true,
          finalAmount: true,
          cashPaid: true,
          bankPaid: true,
          gPayPaid: true,
          remainingCredit: true,
          tripDelta: true,
        },
      }),
      db.incomingBoulder.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }], select: { date: true, qty: true, createdAt: true } }),
      db.dayBook.findMany({
        orderBy: { businessDate: "desc" },
        select: {
          businessDate: true,
          openingCashBalance: true,
          openingBankBalance: true,
          cashSalesTotal: true,
          bankSalesTotal: true,
          gPaySalesTotal: true,
          expenseTotal: true,
          closingCashBalance: true,
          closingBankBalance: true,
        },
      }),
      db.partyCollection.findMany({ orderBy: [{ collectionDate: "desc" }, { createdAt: "desc" }], select: { partyName: true, totalAmount: true, collectionDate: true, createdAt: true } }),
      db.partyCredit.findMany({ orderBy: { createdAt: "desc" }, select: { partyName: true, amount: true, createdAt: true } }),
      db.vehicle.findMany({ orderBy: { vehicleNumber: "asc" }, select: { id: true, vehicleNumber: true, tripCount: true } }),
      db.party.findMany({ orderBy: { partyName: "asc" }, select: { id: true, partyName: true } }),
      db.dayBookExpenseEntry.findMany({ orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }], select: { expenseType: true, amount: true, entryDate: true, createdAt: true } }),
    ]);

  const salesByMaterial = new Map<string, { materialName: string; qty: number; amount: number; finalAmount: number }>();
  const partySales = new Map<string, { partyName: string; count: number; amount: number }>();
  const vehicleTrips = new Map<string, { vehicleNumber: string; trips: number }>();
  const cashBankGpay = { cash: 0, bank: 0, gpay: 0 };
  const daySales = new Map<string, { sales: number; cash: number; bank: number; gpay: number; credit: number }>();
  const monthSales = new Map<string, { sales: number; cash: number; bank: number; gpay: number; credit: number }>();
  const monthlyMaterial = new Map<string, { materialName: string; amount: number; qty: number }>();
  const monthlyPartyOutstanding = new Map<string, { partyName: string; outstanding: number }>();
  const monthlyCollections = new Map<string, { partyName: string; collected: number }>();
  const monthlyVehicleUtilization = new Map<string, { vehicleNumber: string; trips: number }>();
  const monthlyPurchaseSummary = new Map<string, { day: string; qty: number }>();
  const monthlyExpenseSummary = new Map<string, { expenseType: string; amount: number }>();
  const dailyExpenses = new Map<string, { expenseType: string; amount: number }>();
  const dailyPurchases = new Map<string, { qty: number }>();

  for (const sale of sales) {
    const material = salesByMaterial.get(sale.materialName) ?? { materialName: sale.materialName, qty: 0, amount: 0, finalAmount: 0 };
    material.qty += Number(sale.qty ?? 0);
    material.amount += Number(sale.amount ?? 0);
    material.finalAmount += Number(sale.finalAmount ?? 0);
    salesByMaterial.set(sale.materialName, material);

    const party = partySales.get(sale.partyName) ?? { partyName: sale.partyName, count: 0, amount: 0 };
    party.count += 1;
    party.amount += Number(sale.finalAmount ?? 0);
    partySales.set(sale.partyName, party);

    if (sale.vehicleNumber) {
      const currentTrips = vehicleTrips.get(sale.vehicleNumber) ?? { vehicleNumber: sale.vehicleNumber, trips: 0 };
      currentTrips.trips += Number(sale.tripDelta ?? 1);
      vehicleTrips.set(sale.vehicleNumber, currentTrips);
    }

    const day = dayKey(sale.saleDate);
    const daily = daySales.get(day) ?? { sales: 0, cash: 0, bank: 0, gpay: 0, credit: 0 };
    daily.sales += 1;
    daily.cash += Number(sale.cashPaid ?? 0);
    daily.bank += Number(sale.bankPaid ?? 0);
    daily.gpay += Number(sale.gPayPaid ?? 0);
    daily.credit += Number(sale.remainingCredit ?? 0);
    daySales.set(day, daily);

    cashBankGpay.cash += Number(sale.cashPaid ?? 0);
    cashBankGpay.bank += Number(sale.bankPaid ?? 0);
    cashBankGpay.gpay += Number(sale.gPayPaid ?? 0);

    const month = day.slice(0, 7);
    const monthly = monthSales.get(month) ?? { sales: 0, cash: 0, bank: 0, gpay: 0, credit: 0 };
    monthly.sales += 1;
    monthly.cash += Number(sale.cashPaid ?? 0);
    monthly.bank += Number(sale.bankPaid ?? 0);
    monthly.gpay += Number(sale.gPayPaid ?? 0);
    monthly.credit += Number(sale.remainingCredit ?? 0);
    monthSales.set(month, monthly);
  }

  for (const sale of sales) {
    const month = dayKey(sale.saleDate).slice(0, 7);
    const material = monthlyMaterial.get(`${month}:${sale.materialName}`) ?? { materialName: sale.materialName, amount: 0, qty: 0 };
    material.amount += Number(sale.finalAmount ?? 0);
    material.qty += Number(sale.qty ?? 0);
    monthlyMaterial.set(`${month}:${sale.materialName}`, material);
  }

  const totalOutstandingByParty = new Map<string, number>();
  for (const credit of partyCredits) {
    totalOutstandingByParty.set(credit.partyName, roundMoney((totalOutstandingByParty.get(credit.partyName) ?? 0) + credit.amount));
  }
  for (const collection of collections) {
    totalOutstandingByParty.set(collection.partyName, roundMoney((totalOutstandingByParty.get(collection.partyName) ?? 0) - collection.totalAmount));
    monthlyCollections.set(collection.partyName, {
      partyName: collection.partyName,
      collected: roundMoney((monthlyCollections.get(collection.partyName)?.collected ?? 0) + collection.totalAmount),
    });
  }
  for (const party of parties) {
    const partyName = party.partyName ?? "";
    if (!partyName) continue;
    monthlyPartyOutstanding.set(partyName, { partyName, outstanding: roundMoney(totalOutstandingByParty.get(partyName) ?? 0) });
  }

  for (const vehicle of vehicles) {
    const vehicleNumber = vehicle.vehicleNumber ?? "";
    if (!vehicleNumber) continue;
    monthlyVehicleUtilization.set(vehicleNumber, { vehicleNumber, trips: Number(vehicle.tripCount ?? 0) });
  }

  for (const boulder of boulders) {
    const day = dayKey(boulder.date);
    const current = dailyPurchases.get(day) ?? { qty: 0 };
    current.qty += Number(boulder.qty ?? 0);
    dailyPurchases.set(day, current);
    const month = day.slice(0, 7);
    const monthCurrent = monthlyPurchaseSummary.get(month) ?? { day: month, qty: 0 };
    monthCurrent.qty += Number(boulder.qty ?? 0);
    monthlyPurchaseSummary.set(month, monthCurrent);
  }

  for (const expense of dayBookExpenses) {
    const current = dailyExpenses.get(expense.expenseType) ?? { expenseType: expense.expenseType, amount: 0 };
    current.amount += Number(expense.amount ?? 0);
    dailyExpenses.set(expense.expenseType, current);
    const monthCurrent = monthlyExpenseSummary.get(expense.expenseType) ?? { expenseType: expense.expenseType, amount: 0 };
    monthCurrent.amount += Number(expense.amount ?? 0);
    monthlyExpenseSummary.set(expense.expenseType, monthCurrent);
  }

  const dayBookSummary = dayBooks.map((dayBook) => ({
    businessDate: dayBook.businessDate,
    openingCashBalance: dayBook.openingCashBalance,
    openingBankBalance: dayBook.openingBankBalance,
    cashSalesTotal: dayBook.cashSalesTotal,
    bankSalesTotal: dayBook.bankSalesTotal,
    gPaySalesTotal: dayBook.gPaySalesTotal,
    expenseTotal: dayBook.expenseTotal,
    closingCashBalance: dayBook.closingCashBalance,
    closingBankBalance: dayBook.closingBankBalance,
  }));

  return {
    daily: {
      salesSummary: sales,
      materialWiseSales: Array.from(salesByMaterial.values()),
      vehicleTripReport: Array.from(vehicleTrips.values()),
      partyWiseSales: Array.from(partySales.values()),
      creditSales: sales.filter((sale) => Number(sale.remainingCredit ?? 0) > 0),
      cashBankGpaySummary: cashBankGpay,
      expensesSummary: Array.from(dailyExpenses.values()),
      purchasesSummary: boulders,
      dayBookSummary,
    },
    monthly: {
      salesByMaterial: Array.from(monthlyMaterial.values()),
      partyOutstanding: Array.from(monthlyPartyOutstanding.values()),
      collections: collections,
      vehicleUtilization: Array.from(monthlyVehicleUtilization.values()),
      purchaseSummary: Array.from(monthlyPurchaseSummary.values()),
      expenseSummary: Array.from(monthlyExpenseSummary.values()),
    },
    print: {
      saleReceipts: sales,
      dayBookPrint: dayBooks,
      dailyClosingReport: dayBookSummary,
      partyStatements: parties.map((party) => ({
        partyName: party.partyName,
        outstanding: totalOutstandingByParty.get(party.partyName) ?? 0,
        sales: sales.filter((sale) => sale.partyName === party.partyName),
        collections: collections.filter((collection) => collection.partyName === party.partyName),
      })),
    },
  };
}
