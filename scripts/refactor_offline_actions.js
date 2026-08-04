const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/lib/offline-actions.ts');
const source = fs.readFileSync(filePath, 'utf-8');

const lines = source.split('\n');

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

// Types and Helpers up to the first export
let headerLines = [];
let i = 0;
while (i < lines.length && !lines[i].startsWith('export async function listVehicles')) {
  headerLines.push(lines[i]);
  i++;
}

// Find each function block
const functionBlocks = {};
let currentFunc = null;
let currentBlock = [];

for (let j = i; j < lines.length; j++) {
  const line = lines[j];
  const match = line.match(/^export (?:async )?function ([a-zA-Z0-9_]+)\(/);
  if (match) {
    if (currentFunc) {
      functionBlocks[currentFunc] = currentBlock.join('\n');
    }
    currentFunc = match[1];
    currentBlock = [line];
  } else if (currentFunc) {
    currentBlock.push(line);
  }
}
if (currentFunc) {
  functionBlocks[currentFunc] = currentBlock.join('\n');
}

fs.mkdirSync(path.join(__dirname, '../src/app/actions'), { recursive: true });

// Write each module
for (const [mod, funcs] of Object.entries(modules)) {
  const modPath = path.join(__dirname, `../src/app/actions/${mod}.ts`);
  let content = `"use server";\n\n`;
  content += headerLines.join('\n').replace(/"use server";\n*/g, ''); // just put the header in every file to keep it simple!
  content += '\n\n';
  
  for (const func of funcs) {
    if (functionBlocks[func]) {
      content += functionBlocks[func] + '\n\n';
    }
  }
  fs.writeFileSync(modPath, content);
}

// Generate the new offline-actions.ts index
let newOfflineActions = `"use server";\n\n`;
for (const mod of Object.keys(modules)) {
  newOfflineActions += `export * from "@/app/actions/${mod}";\n`;
}

fs.writeFileSync(filePath, newOfflineActions);

console.log("Done refactoring.");
