import {beforeEach,afterEach,it,expect,vi} from 'vitest';import {PrismaClient} from '@prisma/client';import {copyFileSync} from 'node:fs';
// FULL71: every failure path of the transfer save keeps the same sanitized
// contract - one honest retryable public message, no raw ORM/driver text,
// the original error preserved as the cause for server-side diagnostics.
const state=vi.hoisted(()=>({db:null as any}));vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));vi.mock('@/lib/sync/auto-sync',()=>({triggerAutoSync:vi.fn()}));vi.mock('@/app/actions/auth',()=>({verifyEditPassword:async()=>true,requireActor:async()=>null,isEnrollmentComplete:async()=>false}));
import {saveCashTransfer} from '../../src/lib/daybook-actions';import {saveDayBookOpeningBalances} from '../../src/app/actions/daybook_offline';
let n=0;beforeEach(async()=>{const root=process.env.MBM_TEST_ROOT;if(!root)throw Error('isolated fixture required');const f=`${root}/sanitize-${++n}.db`;copyFileSync(`${root}/fixture.db`,f);state.db=new PrismaClient({datasources:{db:{url:`file:${f}`}}});vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 await saveDayBookOpeningBalances({businessDate:'2026-11-09',openingCashBalance:1000,openingBankBalance:500});});
afterEach(async()=>{vi.clearAllTimers();vi.useRealTimers();await state.db.$disconnect();});
const base={submissionId:'33333333-3333-4333-8333-333333333333',type:'CASH_TO_BANK',amount:150,time:'10:00 AM',date:'2026-11-09',remarks:'deposit',userName:'tester'};

it('a non-P2002 storage failure is sanitized: public retryable message, raw text only in the cause',async()=>{
 const raw=Object.assign(new Error('P2021: The table `main.CashTransfer` does not exist in the current database.'),{code:'P2021'});
 const spy=vi.spyOn(state.db,'$transaction').mockRejectedValueOnce(raw);
 try{
  await saveCashTransfer(base);
  expect.unreachable('save should have failed');
 }catch(e){
  expect(e).toBeInstanceOf(Error);
  const m=(e as Error).message;
  expect(m).toMatch(/could not save the transfer right now; please retry/i);
  expect(m).not.toMatch(/P2021|does not exist|main\.CashTransfer/i);
  expect((e as {cause?:unknown}).cause).toBe(raw);
 }
 spy.mockRestore();
 expect(await state.db.cashTransfer.count()).toBe(0);
});

it('a unique-race loss with no surviving row is sanitized the same way',async()=>{
 const raw=Object.assign(new Error('Unique constraint failed on the fields: (`id`)'),{code:'P2002'});
 const spy=vi.spyOn(state.db,'$transaction').mockRejectedValueOnce(raw);
 try{
  await saveCashTransfer(base);
  expect.unreachable('save should have failed');
 }catch(e){
  const m=(e as Error).message;
  expect(m).toMatch(/could not save the transfer right now; please retry/i);
  expect(m).not.toMatch(/unique constraint/i);
  expect((e as {cause?:unknown}).cause).toBe(raw);
 }
 spy.mockRestore();
 expect(await state.db.cashTransfer.count()).toBe(0);
});

it('a changed-intent refusal still surfaces its exact honest message, unsanitized',async()=>{
 await saveCashTransfer(base);
 await expect(saveCashTransfer({...base,amount:900})).rejects.toThrow(/already saved with this reference/i);
 expect(await state.db.cashTransfer.count()).toBe(1);
});

it('a storage fault during the P2002 fallback re-read is sanitized, not a raw throw',async()=>{
 const raw=Object.assign(new Error('Unique constraint failed on the fields: (`id`)'),{code:'P2002'});
 const rereadRaw=new Error('P1001: Can\'t reach database server at `localhost`:`5432`');
 const txSpy=vi.spyOn(state.db,'$transaction').mockRejectedValueOnce(raw);
 const readSpy=vi.spyOn(state.db.cashTransfer,'findUnique').mockRejectedValueOnce(rereadRaw);
 try{
  await saveCashTransfer(base);
  expect.unreachable('save should have failed');
 }catch(e){
  const m=(e as Error).message;
  expect(m).toMatch(/could not save the transfer right now; please retry/i);
  expect(m).not.toMatch(/P1001|reach database server|unique constraint/i);
  expect((e as {cause?:unknown}).cause).toBe(rereadRaw);
 }
 txSpy.mockRestore();readSpy.mockRestore();
 expect(await state.db.cashTransfer.count()).toBe(0);
});
