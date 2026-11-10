import {beforeEach,afterEach,it,expect,vi} from 'vitest';import {PrismaClient} from '@prisma/client';import {copyFileSync,readFileSync} from 'node:fs';
// FULL68: cash-transfer submission idempotency (narrow port of the R7 guard
// pattern, no other R7 content). An ambiguous retry of the SAME transfer must
// return the original row without a second write; a changed intent under the
// same reference is refused honestly. Judah's audit intent: no duplicate money.
const state=vi.hoisted(()=>({db:null as any,dbFile:'',dbs:[] as any[],rot:0}));vi.mock('@/lib/prisma',()=>({getDb:async()=>state.dbs.length?state.dbs[state.rot++%state.dbs.length]:state.db}));vi.mock('@/lib/sync/auto-sync',()=>({triggerAutoSync:vi.fn()}));vi.mock('@/app/actions/auth',()=>({verifyEditPassword:async()=>true,requireActor:async()=>null,isEnrollmentComplete:async()=>false}));
import {saveCashTransfer,fetchDayBookData} from '../../src/lib/daybook-actions';import {saveDayBookOpeningBalances} from '../../src/app/actions/daybook_offline';
let n=0;beforeEach(async()=>{const root=process.env.MBM_TEST_ROOT;if(!root)throw Error('isolated fixture required');const f=`${root}/idem-${++n}.db`;copyFileSync(`${root}/fixture.db`,f);state.db=new PrismaClient({datasources:{db:{url:`file:${f}`}}});state.dbFile=f;state.dbs=[];state.rot=0;vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 await saveDayBookOpeningBalances({businessDate:'2026-11-09',openingCashBalance:1000,openingBankBalance:500});});
afterEach(async()=>{vi.clearAllTimers();vi.useRealTimers();await state.db.$disconnect();for(const d of state.dbs)await d.$disconnect();state.dbs=[];});
const base={submissionId:'11111111-1111-4111-8111-111111111111',type:'CASH_TO_BANK',amount:150,time:'10:00 AM',date:'2026-11-09',remarks:'deposit',userName:'tester'};

it('an ambiguous retry of the SAME transfer returns the original row; exactly one write, one movement',async()=>{
 const first=await saveCashTransfer(base);
 const retry=await saveCashTransfer(base);
 expect(retry.id).toBe(first.id);
 expect(await state.db.cashTransfer.count()).toBe(1);
 const view=await fetchDayBookData('2026-11-09');
 expect({closingCash:view.closingCash,closingBank:view.closingBank}).toEqual({closingCash:850,closingBank:650});
 expect(await state.db.auditLog.count({where:{entityName:'CashTransfer'}})).toBe(1);
});

it('a changed intent under the same reference is refused honestly; the original stays, closing unchanged',async()=>{
 await saveCashTransfer(base);
 await expect(saveCashTransfer({...base,amount:900})).rejects.toThrow(/already saved/i);
 expect(await state.db.cashTransfer.count()).toBe(1);
 const view=await fetchDayBookData('2026-11-09');
 expect({closingCash:view.closingCash,closingBank:view.closingBank}).toEqual({closingCash:850,closingBank:650});
});

it('a genuinely new transfer under a new reference saves normally',async()=>{
 await saveCashTransfer(base);
 await saveCashTransfer({...base,submissionId:'22222222-2222-4222-8222-222222222222',amount:25,type:'BANK_TO_CASH'});
 expect(await state.db.cashTransfer.count()).toBe(2);
 const view=await fetchDayBookData('2026-11-09');
 expect({closingCash:view.closingCash,closingBank:view.closingBank}).toEqual({closingCash:875,closingBank:625});
});

it('a missing or malformed submission reference is refused with zero writes',async()=>{
 await expect(saveCashTransfer({type:'CASH_TO_BANK',amount:150,time:'10:00 AM',date:'2026-11-09',remarks:'x',userName:'tester'} as any)).rejects.toThrow(/reference/i);
 await expect(saveCashTransfer({...base,submissionId:'not-a-uuid'})).rejects.toThrow(/reference/i);
 expect(await state.db.cashTransfer.count()).toBe(0);
});

it('AST contract: the Day Book form persists the submission draft before send, retries it unchanged, clears only on success',async()=>{
 const src=readFileSync('src/components/modules/day-book-page.tsx','utf8');
 expect(src).toMatch(/sessionStorage\.setItem\([^)]*transfer/i);
 expect(src).toMatch(/crypto\.randomUUID\(\)/);
 expect(src).toMatch(/saveCashTransfer\(\{[^}]*submissionId/s);
 expect(src).toMatch(/sessionStorage\.getItem\([^)]*transfer/i);
 expect(src).toMatch(/sessionStorage\.removeItem\([^)]*transfer/i);
});

it('unique-race resolution: a loser seeing P2002 gets the original row back for identical content, no second audit',async()=>{
 const original=await saveCashTransfer(base);
 const auditsBefore=await state.db.auditLog.count({where:{entityName:'CashTransfer'}});
 const spy=vi.spyOn(state.db,'$transaction').mockRejectedValueOnce(Object.assign(new Error('Unique constraint failed on the fields: (`id`)'),{code:'P2002'}));
 const retry=await saveCashTransfer(base);
 expect(retry.id).toBe(original.id);
 expect(await state.db.cashTransfer.count()).toBe(1);
 expect(await state.db.auditLog.count({where:{entityName:'CashTransfer'}})).toBe(auditsBefore);
 spy.mockRestore();
});

it('unique-race resolution: a loser seeing P2002 with changed intent is refused honestly with no ORM text',async()=>{
 await saveCashTransfer(base);
 const spy=vi.spyOn(state.db,'$transaction').mockRejectedValueOnce(Object.assign(new Error('Unique constraint failed on the fields: (`id`)'),{code:'P2002'}));
 await expect(saveCashTransfer({...base,amount:900})).rejects.toThrow(/already saved/i);
 await saveCashTransfer(base).catch((e)=>expect(String(e?.message??e)).not.toMatch(/P2002|Unique constraint/i));
 spy.mockRestore();
 expect(await state.db.cashTransfer.count()).toBe(1);
});
