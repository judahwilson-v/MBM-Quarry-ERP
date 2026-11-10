// AST caller contracts, not browser/Electron transport or pixel evidence.
import { it, expect } from "vitest";
import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
const arity: Record<string,number> = {
  saveSale:3, deleteSale:3,
  saveIncomingBoulder:3, deleteIncomingBoulder:3,
  saveExpense:3, deleteExpense:3, saveFuelPurchase:3, deleteFuelPurchase:3,
  savePartyCollection:2, savePartyPayment:2, deletePartyCollection:3,
  deletePartyPayment:3, saveOtherCredit:2, deleteOtherCredit:3,
  updateGlobalSettings:3,
};
function walk(dir:string):string[] {
  return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):e.name.endsWith('.tsx')?[path.join(dir,e.name)]:[]);
}
it("every reachable TSX caller of a guarded action forwards its session as the final argument",()=>{
  const seen = new Set<string>();
  for(const file of [...walk('src/components'),...walk('src/app')]) {
    // Initial setup intentionally has no session: development/test-only bootstrap.
    if(file==='src/app/setup/page.tsx')continue;
    const src=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    function visit(n:ts.Node) {
      if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&arity[n.expression.text]) {
        const name=n.expression.text;seen.add(name);
        expect(n.arguments.length,`${file} ${name} arity`).toBe(arity[name]);
        expect(n.arguments[n.arguments.length-1].getText(src),`${file} ${name} session`).toContain('getSessionToken');
      }
      ts.forEachChild(n,visit);
    }
    visit(src);
  }
  for(const name of Object.keys(arity)) expect(seen.has(name),`${name} has a checked caller`).toBe(true);
  // FULL74: the retired bulk purge must have NO TSX caller left - the UI can
  // never reach it, so there is no session transport to check.
  expect(seen.has('purgeNonGstSales'),'retired purgeNonGstSales must have no caller').toBe(false);
});
it("collection/payment/other-credit refusal is checked before UI form reset or success",()=>{
  for(const file of ['src/components/modules/credit-pages.tsx','src/components/modules/party-ledger-page.tsx']) {
    const text=readFileSync(file,'utf8');
    const src=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    let checked=0;
    function visit(n:ts.Node) {
      if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&['savePartyCollection','savePartyPayment','saveOtherCredit'].includes(n.expression.text)) {
        checked++;
        const after=text.slice(n.end,n.end+280);
        expect(after).toContain('"error" in res');
        expect(after).toContain('throw new Error');
        const guard=after.indexOf('throw new Error');
        for(const reset of ['setMessage(', 'setForm(', 'setPaymentMode(null)']) {
          const index=after.indexOf(reset);
          if(index>=0)expect(index).toBeGreaterThan(guard);
        }
      }
      ts.forEachChild(n,visit);
    }
    visit(src);expect(checked).toBeGreaterThan(0);
  }
});
