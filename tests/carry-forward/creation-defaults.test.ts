import {beforeEach,afterEach,it,expect,vi} from 'vitest';import {PrismaClient} from '@prisma/client';import {copyFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null as any}));vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));vi.mock('@/lib/sync/auto-sync',()=>({triggerAutoSync:vi.fn()}));vi.mock('@/app/actions/auth',()=>({verifyEditPassword:async()=>true,requireActor:async()=>null,isEnrollmentComplete:async()=>false}));
import {saveEmployeeLedgerEntry} from '../../src/app/actions/employees';import {saveDayBookOpeningBalances,saveDayBookExpense} from '../../src/app/actions/daybook_offline';import {fetchDayBookData} from '../../src/lib/daybook-actions';import {getOrCreateDayBook} from '../../src/lib/domain/daybook';
let n=0;beforeEach(async()=>{const root=process.env.MBM_TEST_ROOT;if(!root)throw Error('isolated fixture required');const f=`${root}/carry-${++n}.db`;copyFileSync(`${root}/fixture.db`,f);state.db=new PrismaClient({datasources:{db:{url:`file:${f}`}}});vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});await state.db.employee.create({data:{id:'worker',name:'Synthetic carry forward'}});});afterEach(async()=>{vi.clearAllTimers();vi.useRealTimers();await state.db.$disconnect();});
const opening=(day:string,cash:number,bank:number)=>saveDayBookOpeningBalances({businessDate:day,openingCashBalance:cash,openingBankBalance:bank});const expense=(day:string,amount:number)=>saveDayBookExpense({businessDate:day,expenseType:'LABOUR',amount});
const pay=(day:string)=>saveEmployeeLedgerEntry({employeeId:'worker',date:day,type:'ADVANCE',amount:200,cashPaid:200});
it('first worker cash payment preserves prior closing900 shown by reader and bank50',async()=>{
 await opening('2026-11-08',1000,50);await expense('2026-11-08',100);const before=await fetchDayBookData('2026-11-09');expect(before.openingCash).toBe(900);expect(before.openingBank).toBe(50);
 await pay('2026-11-09');const after=await fetchDayBookData('2026-11-09');expect(after.openingCash).toBe(900);expect(after.openingBank).toBe(50);expect(after.closingCash).toBe(700);expect(after.closingBank).toBe(50);
});
it('shared factory and direct expense use the same initial prior closing',async()=>{
 await opening('2026-11-08',300,70);await expense('2026-11-09',20);const view=await fetchDayBookData('2026-11-09');expect(view.openingCash).toBe(300);expect(view.closingCash).toBe(280);expect(view.openingBank).toBe(70);
});
it.each([400,0])('explicitly saved opening %s remains untouched, including owner withdrawal adjustment',async(cash)=>{
 await opening('2026-11-08',1000,50);await opening('2026-11-09',cash,25);await pay('2026-11-09');const view=await fetchDayBookData('2026-11-09');expect(view.openingCash).toBe(cash);expect(view.openingBank).toBe(25);expect(view.closingCash).toBe(cash-200);
});
it('missing immediate previous day stays zero even if an older book exists (matches existing reader)',async()=>{
 await opening('2026-11-07',1000,50);expect((await fetchDayBookData('2026-11-09')).openingCash).toBe(0);await pay('2026-11-09');expect((await fetchDayBookData('2026-11-09')).openingCash).toBe(0);expect((await fetchDayBookData('2026-11-09')).closingCash).toBe(-200);
});
it('later saved opening is not rewritten by a backdated expense or rereading its book',async()=>{
 await opening('2026-11-08',1000,50);await opening('2026-11-09',777,33);const before=await state.db.dayBook.findUnique({where:{businessDate:new Date('2026-11-09T00:00:00Z')}});await expense('2026-11-08',100);await state.db.$transaction((tx:any)=>getOrCreateDayBook(tx,'2026-11-09'));const after=await state.db.dayBook.findUnique({where:{id:before.id}});expect(after).toEqual(before);
});
it('year boundary and negative prior closing preserve exact signed amounts',async()=>{
 await opening('2026-12-31',-50,12.5);await expense('2027-01-01',20);const view=await fetchDayBookData('2027-01-01');expect(view.openingCash).toBe(-50);expect(view.openingBank).toBe(12.5);expect(view.closingCash).toBe(-70);
});
