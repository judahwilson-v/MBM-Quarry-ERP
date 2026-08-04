const fs = require('fs');

const path = 'src/lib/offline-actions.ts';
let code = fs.readFileSync(path, 'utf8');

// 1. Add import
if (!code.includes('triggerAutoSync')) {
  code = code.replace(
    'import { getDb } from "@/lib/prisma";',
    'import { getDb } from "@/lib/prisma";\nimport { triggerAutoSync } from "@/lib/sync/auto-sync";'
  );
}

// 2. We need to wrap db.$transaction calls.
// Most look like: return serialize(await db.$transaction(async (tx) => { ... }));
// Or: await db.$transaction(async (tx) => { ... });
// Since we want to ensure triggerAutoSync() is called after ANY transaction in this file,
// we can just replace `await db.$transaction` with a custom wrapper.

if (!code.includes('async function runTx')) {
  const wrapper = `
async function runTx<T>(txFn: any): Promise<T> {
  const db = await getDb();
  try {
    return await db.$transaction(txFn);
  } finally {
    triggerAutoSync().catch(console.error);
  }
}
`;
  code = code.replace('export async function listVehicles', wrapper + '\nexport async function listVehicles');
}

// Now replace all `await db.$transaction(` with `await runTx(`
code = code.replace(/await db\.\$transaction\(/g, 'await runTx(');

fs.writeFileSync(path, code, 'utf8');
console.log('Successfully injected auto-sync wrapper into offline-actions.ts');
