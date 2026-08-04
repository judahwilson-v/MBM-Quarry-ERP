const fs = require('fs');
const path = require('path');

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

// reverse map function to module
const funcToMod = {};
for (const [mod, funcs] of Object.entries(modules)) {
  for (const f of funcs) {
    funcToMod[f] = mod;
  }
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // match import { ... } from "@/lib/offline-actions" (handles multiline)
  const importRegex = /import\s*{\s*([^}]+?)\s*}\s*from\s*["']@\/lib\/offline-actions["'];?/g;
  
  content = content.replace(importRegex, (match, importsStr) => {
    const funcs = importsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const modGroups = {};
    for (const f of funcs) {
      const funcName = f.split(' as ')[0].trim(); // in case of alias
      const mod = funcToMod[funcName] || 'UNKNOWN';
      if (!modGroups[mod]) modGroups[mod] = [];
      modGroups[mod].push(f);
    }
    
    let replacement = '';
    for (const [mod, modFuncs] of Object.entries(modGroups)) {
      if (mod === 'UNKNOWN') {
         console.warn(`UNKNOWN FUNCTION ${modFuncs.join(',')} in ${filePath}`);
         replacement += `import { ${modFuncs.join(', ')} } from "@/lib/offline-actions";\n`;
      } else {
         replacement += `import { ${modFuncs.join(', ')} } from "@/app/actions/${mod}";\n`;
      }
    }
    return replacement.trim();
  });
  
  fs.writeFileSync(filePath, content);
}

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      if (!fullPath.includes('offline-actions')) {
         processFile(fullPath);
      }
    }
  }
}

walk(path.join(__dirname, '../src/components'));
walk(path.join(__dirname, '../src/app'));

console.log("Imports updated.");
