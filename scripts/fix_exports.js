const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/lib/offline-actions.ts');

const modules = {
  vehicles: ['listVehicles', 'saveVehicle', 'deleteVehicle'],
  parties: ['listParties', 'saveParty', 'deleteParty'],
  materials: ['listMaterials', 'updateMaterialRate'],
  sales: ['listSales', 'getLastBookPage', 'saveSale', 'deleteSale', 'purgeNonGstSales'],
  purchases: ['listIncomingBoulder', 'saveIncomingBoulder', 'deleteIncomingBoulder'],
  credits: ['listPartyCreditSummary', 'listPartyCreditEntries', 'listPartyCollectionSummary', 'listPartyCollectionHistory', 'savePartyCollection', 'savePartyPayment', 'deletePartyCollection', 'deletePartyPayment', 'listPartiesWithBalances', 'listPartyLedgerEntries', 'listOtherCredits', 'saveOtherCredit', 'deleteOtherCredit'],
  employees: ['listEmployeeCredits', 'saveEmployeeCredit', 'deleteEmployeeCredit', 'listEmployees', 'saveEmployee', 'deleteEmployee', 'saveEmployeeLedgerEntry', 'getEmployeeLedger'],
  daybook_offline: ['getTodayForInput', 'saveDayBookOpeningBalances', 'saveDayBookExpense', 'rebuildBusinessDayBook'],
  expenses: ['listExpenses', 'saveExpense', 'deleteExpense'],
  fuel: ['listFuelPurchases', 'saveFuelPurchase', 'deleteFuelPurchase'],
  dashboard: ['getDashboardTotals'],
};

let newOfflineActions = `"use server";\n\n`;
for (const [mod, funcs] of Object.entries(modules)) {
  newOfflineActions += `export { ${funcs.join(', ')} } from "@/app/actions/${mod}";\n`;
}

fs.writeFileSync(filePath, newOfflineActions);

console.log("Done refactoring export statements.");
