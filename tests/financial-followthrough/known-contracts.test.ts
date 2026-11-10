import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';import {copyFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));
vi.mock('@/lib/sync/auto-sync',()=>({triggerAutoSync:vi.fn()}));
vi.mock('@/app/actions/auth',()=>({verifyEditPassword:async()=>true,requireActor:async()=>null,isEnrollmentComplete:async()=>false}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {saveSale} from '../../src/app/actions/sales';
import {saveExpense} from '../../src/app/actions/expenses';
import {saveDayBookOpeningBalances,saveDayBookExpense} from '../../src/app/actions/daybook_offline';
import {fetchDayBookData} from '../../src/lib/daybook-actions';
import {saveEmployeeLedgerEntry} from '../../src/app/actions/employees';
let n=0;
beforeEach(async()=>{const root=process.env.MBM_TEST_ROOT;if(!root)throw Error('isolated fixture required');const f=`${root}/followthrough-${++n}.db`;copyFileSync(`${root}/fixture.db`,f);state.db=new PrismaClient({datasources:{db:{url:`file:${f}`}}});vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});await state.db.employee.create({data:{id:'worker',name:'Synthetic next contracts'}});});
afterEach(async()=>{vi.clearAllTimers();vi.useRealTimers();await state.db.$disconnect();});
it('F06 desired contract: edited sale, FinancialEvent, ledger and stored Day Book should agree',async()=>{
 await state.db.material.create({data:{id:'material',materialName:'Synthetic Rock',ratePerCft:20}});
 const input={saleDate:'2026-11-09',vehicleNumber:'TEST 002',partyName:'Synthetic Customer',materialId:'material',qty:5,ratePerCft:20,discountType:'percentage' as const,discountValue:0,cashPaid:100,bankPaid:0,gPayPaid:0,bookNumber:'31',pageNumber:'2'};
 const created=await saveSale(input);expect(created.success).toBe(true);
 const edited=await saveSale({...input,id:created.data!.id,qty:10,cashPaid:200,quantityReason:'Synthetic measured correction'},'1234');expect(edited.success).toBe(true);
 const event=await state.db.financialEvent.findFirst({where:{entityId:created.data!.id}});const ledger=await state.db.ledgerEntry.findFirst();const book=await state.db.dayBook.findFirst();const view=await fetchDayBookData('2026-11-09');
 console.log('F06_ACTUAL',JSON.stringify({sale:edited.data,financialPayload:event.payload,ledger,book,view}));
 expect(ledger.totalAmount).toBe(edited.data!.finalAmount);expect(book.cashSalesTotal).toBe(view.cashSales);
});
it('carry-forward desired contract: creating first expense must preserve the previous closing shown immediately before',async()=>{
 await saveDayBookOpeningBalances({businessDate:'2026-11-08',openingCashBalance:1000,openingBankBalance:0});
 await saveDayBookExpense({businessDate:'2026-11-08',expenseType:'LABOUR',amount:100});
 const before=await fetchDayBookData('2026-11-09');expect(before.openingCash).toBe(900);
 await saveEmployeeLedgerEntry({employeeId:'worker',date:'2026-11-09',type:'ADVANCE',amount:200,cashPaid:200});
 const after=await fetchDayBookData('2026-11-09');console.log('CARRY_FORWARD_ACTUAL',JSON.stringify({before,after,books:await state.db.dayBook.findMany()}));
 expect(after.openingCash).toBe(before.openingCash);expect(after.closingCash).toBe(700);
});
it('F07 desired contract: explicit BANK expense should debit bank rather than cash',async()=>{
 await saveDayBookOpeningBalances({businessDate:'2026-11-09',openingCashBalance:1000,openingBankBalance:500});
 expect((await saveExpense({expenseDate:'2026-11-09',expenseType:'MISCELLANEOUS',amount:100,paymentMode:'BANK'})).success).toBe(true);
 const view=await fetchDayBookData('2026-11-09');const expense=await state.db.expense.findFirst();console.log('BANK_EXPENSE_ACTUAL',JSON.stringify({expense,view}));
 expect(view.closingCash).toBe(1000);expect(view.closingBank).toBe(400);
});
