const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'app', 'actions', 'purchases.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// Use \r?\n for Windows compatibility

// 1. Unused Imports
content = content.replace(/import \{ deriveSalesEngine(?:, type SalesDraft)? \} from "@\/lib\/sales-engine";\r?\n/g, '');
content = content.replace(/import \{ calculateRemainingCredit, decrementVehicleTrips, incrementVehicleTrips, writeAuditEvent \} from "@\/lib\/domain";\r?\n/g, 'import { writeAuditEvent } from "@/lib/domain";\n');
content = content.replace(/import \{ emitFinancialEvent \} from "@\/lib\/domain\/financial-events";\r?\n/g, '');
content = content.replace(/import \{ addDayBookExpense, rebuildDayBook, setDayBookOpeningBalances, projectDayBookExpense, recalculateDayBook, getOrCreateDayBook \} from "@\/lib\/domain\/daybook";\r?\n/g, 'import { addDayBookExpense, recalculateDayBook, getOrCreateDayBook } from "@/lib/domain/daybook";\n');
content = content.replace(/import \{ verifyEditPassword \} from "@\/app\/actions\/auth";\r?\n/g, '');

// 2. Unused Types
content = content.replace(/type VehicleInput = \{[\s\S]*?\};\r?\n+/g, '');
content = content.replace(/type PartyInput = \{[\s\S]*?\};\r?\n+/g, '');
content = content.replace(/type SaleInput = [\s\S]*?\};\r?\n+/g, '');
content = content.replace(/type EmployeeCreditInput = \{[\s\S]*?\};\r?\n+/g, '');

// 3. Unused Functions
content = content.replace(/function roundMoney\(value: number\) \{[\s\S]*?\}\r?\n+/g, '');
content = content.replace(/function requiredText\(value: string \| null \| undefined, label: string\) \{[\s\S]*?\}\r?\n+/g, '');
content = content.replace(/function dateOnly\(value: Date \| string\) \{[\s\S]*?\}\r?\n+/g, '');

// Also remove unused 'const db = await getDb();' in listIncomingBoulder and deleteIncomingBoulder etc where db isn't used
// wait, db is used in listIncomingBoulder: `const rows = await db.incomingBoulder.findMany`
// ESLint said db is assigned but never used in lines 176, 193, 296
content = content.replace(/const db = await getDb\(\);\r?\n\s*try \{/g, 'try {'); // runTx fix already removes it, but wait:
const runTxBug = `async function runTx<T>(txFn: (tx: any) => Promise<T>): Promise<T> {
  const db = await getDb();
  try {
    return await runTx(txFn);
  } finally {
    triggerAutoSync().catch(console.error);
  }
}`;
const runTxFix = `async function runTx<T>(txFn: (tx: any) => Promise<T>): Promise<T> {
  const db = await getDb();
  try {
    return await db.$transaction(txFn);
  } finally {
    triggerAutoSync().catch(console.error);
  }
}`;
// Wait, actually I will just do exact string replacement, it doesn't care about regex if I use a literal string, but the literal string has \n while the file has \r\n.
// I will just use regex for runTx too.
content = content.replace(/async function runTx<T>\(txFn: \(tx: any\) => Promise<T>\): Promise<T> \{\r?\n\s*const db = await getDb\(\);\r?\n\s*try \{\r?\n\s*return await runTx\(txFn\);\r?\n\s*\} finally \{\r?\n\s*triggerAutoSync\(\)\.catch\(console\.error\);\r?\n\s*\}\r?\n\}/g, 
`async function runTx<T>(txFn: (tx: any) => Promise<T>): Promise<T> {
  const db = await getDb();
  try {
    return await db.$transaction(txFn);
  } finally {
    triggerAutoSync().catch(console.error);
  }
}`);

content = content.replace(/export async function listIncomingBoulder\(search = ""\) \{\r?\n\s*const db = await getDb\(\);/g, 'export async function listIncomingBoulder(search = "") {\n  const db = await getDb();'); // wait, ESLint says db is unused in 193 (saveIncomingBoulder) and 296 (deleteIncomingBoulder)? Let's check!
// In saveIncomingBoulder:
// const db = await getDb();
// but then it doesn't use it, it uses runTx !
content = content.replace(/export async function saveIncomingBoulder\(input: IncomingBoulderInput\) \{\r?\n\s*const db = await getDb\(\);/g, 'export async function saveIncomingBoulder(input: IncomingBoulderInput) {');
content = content.replace(/export async function deleteIncomingBoulder\(id: string\) \{\r?\n\s*const db = await getDb\(\);/g, 'export async function deleteIncomingBoulder(id: string) {');
content = content.replace(/async function runTx<T>\(txFn: \(tx: any\) => Promise<T>\): Promise<T> \{\r?\n\s*const db = await getDb\(\);\r?\n\s*try \{\r?\n\s*return await db\.\$transaction/g, 'async function runTx<T>(txFn: (tx: any) => Promise<T>): Promise<T> {\n  const db = await getDb();\n  try {\n    return await db.$transaction'); // Wait, db is used in db.$transaction! So that's good!

fs.writeFileSync(filePath, content);
console.log('Fixed purchases.ts');
