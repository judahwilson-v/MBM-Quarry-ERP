import {beforeEach,afterEach,it,expect,vi} from 'vitest';import {PrismaClient} from '@prisma/client';import {copyFileSync} from 'node:fs';
// FULL69 tripwire: an audit-write fault must roll the transfer back (record-
// every-change intent). On frozen FULL68 the audit write is OUTSIDE the
// transaction, so the row survives the fault - this test is RED there.
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));
vi.mock('@/lib/sync/auto-sync',()=>({triggerAutoSync:vi.fn()}));
vi.mock('@/app/actions/auth',()=>({verifyEditPassword:async()=>true,requireActor:async()=>null,isEnrollmentComplete:async()=>false}));
vi.mock('@/lib/domain',async(importOriginal)=>{const actual=await importOriginal<any>();return {...actual,writeAuditEvent:async()=>{throw new Error('injected audit fault');}};});
import {saveCashTransfer,fetchDayBookData} from '../../src/lib/daybook-actions';import {saveDayBookOpeningBalances} from '../../src/app/actions/daybook_offline';
beforeEach(async()=>{const root=process.env.MBM_TEST_ROOT;if(!root)throw Error('isolated fixture required');const f=`${root}/audit-fault.db`;copyFileSync(`${root}/fixture.db`,f);state.db=new PrismaClient({datasources:{db:{url:`file:${f}`}}});vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 await saveDayBookOpeningBalances({businessDate:'2026-11-09',openingCashBalance:1000,openingBankBalance:500});});
afterEach(async()=>{vi.clearAllTimers();vi.useRealTimers();await state.db.$disconnect();});

it('FULL69: an audit-write fault rolls the transfer back - zero rows, closing unchanged, failure surfaces',async()=>{
 await expect(saveCashTransfer({submissionId:'77777777-7777-4777-8777-777777777777',type:'CASH_TO_BANK',amount:150,time:'10:00 AM',date:'2026-11-09',remarks:'deposit',userName:'tester'})).rejects.toThrow();
 expect(await state.db.cashTransfer.count()).toBe(0);
 const view=await fetchDayBookData('2026-11-09');
 expect({closingCash:view.closingCash,closingBank:view.closingBank}).toEqual({closingCash:1000,closingBank:500});
 console.log('F69_AUDIT_FAULT_ACTUAL',JSON.stringify({rows:await state.db.cashTransfer.count(),closingCash:view.closingCash,closingBank:view.closingBank}));
});
