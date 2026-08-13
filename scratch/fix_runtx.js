const fs = require('fs');
const path = require('path');

const actionsDir = path.join(__dirname, 'src', 'app', 'actions');
const files = fs.readdirSync(actionsDir).filter(f => f.endsWith('.ts'));

const runTxBugRegex = /async function runTx<T>\(txFn: \(tx: any\) => Promise<T>\): Promise<T> \{\r?\n\s*const db = await getDb\(\);\r?\n\s*try \{\r?\n\s*return await runTx\(txFn\);\r?\n\s*\} finally \{\r?\n\s*triggerAutoSync\(\)\.catch\(console\.error\);\r?\n\s*\}\r?\n\}/g;
const runTxFix = `async function runTx<T>(txFn: (tx: any) => Promise<T>): Promise<T> {
  const db = await getDb();
  try {
    return await db.$transaction(txFn);
  } finally {
    triggerAutoSync().catch(console.error);
  }
}`;

for (const file of files) {
  const filePath = path.join(actionsDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  content = content.replace(runTxBugRegex, runTxFix);

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log('Fixed runTx bug in', file);
  }
}
