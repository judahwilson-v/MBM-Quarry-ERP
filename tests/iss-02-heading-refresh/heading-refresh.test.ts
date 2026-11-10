import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {copyFileSync,readFileSync} from 'node:fs';
import ts from 'typescript';
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));
vi.mock('@/lib/sync/auto-sync',()=>({triggerAutoSync:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {savePartyCollection,savePartyPayment,listPartiesWithBalances} from '../../src/app/actions/credits';
// Failing-first anchor: this import target does not exist before the bounded fix.
import {resolveSelectedPartyAfterRefresh,canExportOrPrintLedger} from '../../src/lib/party-selection';

let n=0;
beforeEach(async()=>{
 const root=process.env.MBM_TEST_ROOT;if(!root)throw Error('isolated fixture required');
 const f=`${root}/iss02-${++n}.db`;copyFileSync(`${root}/fixture.db`,f);
 state.db=new PrismaClient({datasources:{db:{url:`file:${f}`}}});
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 await state.db.party.create({data:{partyName:'Synthetic Party'}});
});
afterEach(async()=>{vi.clearAllTimers();vi.useRealTimers();await state.db.$disconnect();});

// Characterization (passes before and after the fix): the server summary updates
// immediately after a write, so ISS-02 is a view-state defect, not a data defect.
it('server summary reflects writes immediately, and a settled party leaves the nonzero summary (characterization)',async()=>{
 await savePartyPayment({partyName:'Synthetic Party',paymentDate:'2026-11-09',cashPaid:200,bankPaid:0,gPayPaid:0});
 let rows=await listPartiesWithBalances() as any[];
 expect(rows.find(r=>r.partyName==='Synthetic Party').balance).toBe(200);
 await savePartyCollection({partyName:'Synthetic Party',collectionDate:'2026-11-09',cashPaid:120,bankPaid:0,gPayPaid:0});
 rows=await listPartiesWithBalances() as any[];
 expect(rows.find(r=>r.partyName==='Synthetic Party').balance).toBe(80);
 await savePartyCollection({partyName:'Synthetic Party',collectionDate:'2026-11-09',cashPaid:80,bankPaid:0,gPayPaid:0});
 rows=await listPartiesWithBalances() as any[];
 // listPartiesWithBalances filters balance != 0: a settled party disappears from the summary list.
 expect(rows.find(r=>r.partyName==='Synthetic Party')).toBeUndefined();
});

// ISS-02 acceptance (fails pre-fix): the row a heading is rendered from after a
// write must carry the fresh server balance, not the balance captured at selection.
it('ISS-02 acceptance: after a write the reselected heading row equals the fresh server balance, including the settle-to-zero edge',async()=>{
 await savePartyPayment({partyName:'Synthetic Party',paymentDate:'2026-11-09',cashPaid:200,bankPaid:0,gPayPaid:0});
 const t0=await listPartiesWithBalances() as any[];
 const selected=t0.find(r=>r.partyName==='Synthetic Party'); // row captured at click time
 await savePartyCollection({partyName:'Synthetic Party',collectionDate:'2026-11-09',cashPaid:120,bankPaid:0,gPayPaid:0});
 const fresh=await listPartiesWithBalances() as any[];
 const resolution=resolveSelectedPartyAfterRefresh(fresh,selected);
 expect(resolution.kind).toBe('refreshed');
 expect(resolution.party.id).toBe(selected.id);
 expect(resolution.party.balance).toBe(80);
 expect(resolution.party.balance).toBe(fresh.find(r=>r.id===selected.id).balance);
 // Settle-to-zero edge: the party drops out of the nonzero summary; the heading
 // must read 0 (truthful), not the pre-write balance (stale) and must not vanish.
 await savePartyCollection({partyName:'Synthetic Party',collectionDate:'2026-11-09',cashPaid:80,bankPaid:0,gPayPaid:0});
 const fresh2=await listPartiesWithBalances() as any[];
 expect(fresh2.find(r=>r.id===selected.id)).toBeUndefined();
 const r2=resolveSelectedPartyAfterRefresh(fresh2,resolution.party);
 expect(r2.kind).toBe('settled');
 expect(r2.party.id).toBe(selected.id);
 expect(r2.party.partyName).toBe('Synthetic Party');
 expect(r2.party.balance).toBe(0);
});

it('ISS-02 resolution falls back to the previous row only when the summary reload itself failed',()=>{
 const prev={id:'p1',partyName:'Synthetic Party',balance:80};
 expect(resolveSelectedPartyAfterRefresh(undefined,prev)).toEqual({kind:'stale-fallback',party:prev});
});

// ISS-02 v2 error honesty (fails on the v1 candidate): after a committed write
// whose summary reload FAILED, the last known balance is UNVERIFIED - the UI
// must not show it as current truth and must not export/print it.
it('ISS-02 v2: export/print is blocked while the summary is unverified, allowed when verified with a selection',()=>{
 const party={id:'p1',partyName:'Synthetic Party',balance:80};
 expect(canExportOrPrintLedger(true,party)).toBe(false);   // unverified summary
 expect(canExportOrPrintLedger(false,party)).toBe(true);   // verified summary
 expect(canExportOrPrintLedger(false,null)).toBe(false);   // nothing selected
});

it('ISS-02 v2 AST contract: heading shows unknown (not the stale number), export/print disabled, and a retry path reselects from a fresh summary',()=>{
 const text=readFileSync('src/components/modules/party-ledger-page.tsx','utf8');
 // The heading block must gate the numeric balance on the summary-stale flag.
 const headingStart=text.indexOf('Current Balance:');
 expect(headingStart).toBeGreaterThanOrEqual(0);
 const headingBlock=text.slice(headingStart,headingStart+900);
 expect(headingBlock).toMatch(/summaryStale/);
 // The numeric balance must NOT render unconditionally in the heading block.
 expect(headingBlock).not.toMatch(/^((?!summaryStale)[\s\S])*formatCurrency\(Math\.abs\(selectedParty\.balance\)\)([\s\S](?!summaryStale))*$/);
 // Export guard and both buttons honor the stale flag.
 expect(text).toMatch(/canExportOrPrintLedger\(summaryStale/);
 const disabledCount=(text.match(/disabled=\{summaryStale\}/g)||[]).length;
 expect(disabledCount).toBeGreaterThanOrEqual(2);
 // Retry path: reloads the summary and reselects from the fresh rows.
 expect(text).toMatch(/handleSummaryRetry/);
 const retryStart=text.indexOf('handleSummaryRetry');
 const retryBlock=text.slice(retryStart,retryStart+600);
 expect(retryBlock).toMatch(/loadSummary\(\)/);
 expect(retryBlock).toMatch(/resolveSelectedPartyAfterRefresh/);
 // Sidebar empty state must not claim "no active ledgers" while the summary is unverified.
 const sidebarEmpty=text.indexOf('No active party ledgers found.');
 expect(text.slice(Math.max(0,sidebarEmpty-400),sidebarEmpty)).toMatch(/summaryStale/);
});

// ISS-02 v3 (fails on the v2 candidate): the print-media statement is a separate
// render path (print-only blocks are hidden on screen), so gating the screen
// heading and the print BUTTON is not enough - the printed Closing Balance must
// itself be honest when the summary is unverified, and a successful summary
// reload must clear the recovered error state.
it('ISS-02 v3 AST contract: printed Closing Balance is gated on summaryStale (native print cannot show an unverified closing)',()=>{
 const text=readFileSync('src/components/modules/party-ledger-page.tsx','utf8');
 const closingStart=text.indexOf('Closing Balance:');
 expect(closingStart).toBeGreaterThanOrEqual(0);
 const closingBlock=text.slice(closingStart-700,closingStart+900);
 expect(closingBlock).toMatch(/summaryStale/);
});
it('ISS-02 v3 AST contract: a successful summary reload clears the error state (recovered view shows no stale error)',()=>{
 const text=readFileSync('src/components/modules/party-ledger-page.tsx','utf8');
 const source=ts.createSourceFile('party-ledger-page.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let loadSummaryBody='';
 function visit(node:ts.Node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='loadSummary')loadSummaryBody=node.getText(source);
  ts.forEachChild(node,visit);
 }
 visit(source);
 expect(loadSummaryBody).toContain('setSummaryStale(false)');
 expect(loadSummaryBody).toContain('setError("")');
 // The clear must happen on the SUCCESS path, i.e. before the catch returns undefined.
 expect(loadSummaryBody.indexOf('setError("")')).toBeLessThan(loadSummaryBody.indexOf('catch'));
});

// AST contract (not a browser test; actual-UI evidence belongs to independent QA):
// the component's post-write reload paths must rebuild the selected row from the
// fresh summary instead of re-selecting the object captured at click time.
it('party ledger UI rebuilds the selected row from the fresh summary after writes (AST contract)',()=>{
 const text=readFileSync('src/components/modules/party-ledger-page.tsx','utf8');
 // The stale pattern: re-selecting the click-time object after a write.
 expect(text).not.toMatch(/loadEntries\(\s*selectedParty\s*\)/);
 // loadSummary must return the fetched rows so callers can resolve from them.
 expect(text).toMatch(/const rows = \(?await listPartiesWithBalances/);
 expect(text).toMatch(/return rows;/);
 const source=ts.createSourceFile('party-ledger-page.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const handlerCalls:Record<string,number>={handlePaymentSubmit:0,handleDeleteEntry:0};
 function visit(node:ts.Node,inHandler:string|null){
  let handler=inHandler;
  if(ts.isFunctionDeclaration(node)&&node.name&&node.name.text in handlerCalls)handler=node.name.text;
  if(handler&&ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='resolveSelectedPartyAfterRefresh')handlerCalls[handler]++;
  ts.forEachChild(node,(child)=>visit(child,handler));
 }
 visit(source,null);
 expect(handlerCalls.handlePaymentSubmit).toBeGreaterThanOrEqual(1);
 expect(handlerCalls.handleDeleteEntry).toBeGreaterThanOrEqual(1);
});
