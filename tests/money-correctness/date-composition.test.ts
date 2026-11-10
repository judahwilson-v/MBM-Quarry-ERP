import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client'; import {copyFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));
vi.mock('@/lib/sync/auto-sync',()=>({triggerAutoSync:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/app/actions/auth',()=>({verifyEditPassword:async()=>true,requireActor:async()=>null,isEnrollmentComplete:async()=>false}));
import {saveEmployeeLedgerEntry} from '../../src/app/actions/employees';
import {saveDayBookExpense,saveDayBookOpeningBalances} from '../../src/app/actions/daybook_offline';
import {fetchDayBookData} from '../../src/lib/daybook-actions';
import {saveExpense,deleteExpense} from '../../src/app/actions/expenses';
import {saveFuelPurchase,deleteFuelPurchase} from '../../src/app/actions/fuel';
import {saveSale,deleteSale,checkDuplicateSaleBookNumber,getLastBookPage} from '../../src/app/actions/sales';
import {emitFinancialEvent} from '../../src/lib/domain/financial-events';
let n=0;
beforeEach(async()=>{const root=process.env.MBM_TEST_ROOT;if(!root)throw Error('isolated fixture required');const f=`${root}/composition-${++n}.db`;copyFileSync(`${root}/fixture.db`,f);state.db=new PrismaClient({datasources:{db:{url:`file:${f}`}}});vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});await state.db.employee.create({data:{id:'worker',name:'Synthetic composition'}});});
afterEach(async()=>{vi.clearAllTimers();vi.useRealTimers();await state.db.$disconnect();});
const pay=()=>saveEmployeeLedgerEntry({employeeId:'worker',date:'2026-11-09',type:'ADVANCE',amount:200,cashPaid:200});
it('composition probe: opening balance and worker expense should share one visible Day Book',async()=>{
 await saveDayBookOpeningBalances({businessDate:'2026-11-09',openingCashBalance:1000,openingBankBalance:50});await pay();
 const view=await fetchDayBookData('2026-11-09');console.log('OPENING_COMPOSITION',JSON.stringify({view,books:await state.db.dayBook.findMany()}));
 expect(view.openingCash).toBe(1000);expect(view.cashExp).toBe(200);expect(view.closingCash).toBe(800);expect(await state.db.dayBook.count()).toBe(1);
});
it('composition probe: deleting a worker-mirrored expense is refused and the stored Day Book stays consistent',async()=>{
 await pay();const expense=await state.db.expense.findFirst();const result=await deleteExpense(expense.id,'1234');
 expect(result.success).toBe(false);expect(result.error).toMatch(/does not yet support correcting/);
 const books=await state.db.dayBook.findMany();
 expect(books).toHaveLength(1);expect(books[0].expenseTotal).toBe(200);expect(books[0].closingCashBalance).toBe(-200);
 expect((await fetchDayBookData('2026-11-09')).cashExp).toBe(200);
});
it('shared date key: direct Day Book expense uses existing opening and is visible',async()=>{
 await saveDayBookOpeningBalances({businessDate:'2026-11-09',openingCashBalance:1000,openingBankBalance:50});
 await saveDayBookExpense({businessDate:'2026-11-09',expenseType:'LABOUR',amount:80});
 const view=await fetchDayBookData('2026-11-09');expect(view.openingCash).toBe(1000);expect(view.cashExp).toBe(80);expect(view.closingCash).toBe(920);expect(await state.db.dayBook.count()).toBe(1);
});
it('manual expense create, move across business dates and delete recalculates old and new books',async()=>{
 const created=await saveExpense({expenseDate:'2026-11-09',expenseType:'LABOUR',amount:80});expect(created.success).toBe(true);
 expect((await fetchDayBookData('2026-11-09')).cashExp).toBe(80);
 const changed=await saveExpense({id:created.data!.id,expenseDate:'2026-11-10',expenseType:'LABOUR',amount:90},'test-edit-pin');expect(changed.success).toBe(true);
 expect((await fetchDayBookData('2026-11-09')).cashExp).toBe(0);expect((await fetchDayBookData('2026-11-10')).cashExp).toBe(90);
 const old=await state.db.dayBook.findUnique({where:{businessDate:new Date('2026-11-09T00:00:00Z')}});expect(old.expenseTotal).toBe(0);expect(old.closingCashBalance).toBe(0);
 expect((await deleteExpense(created.data!.id,'1234')).success).toBe(true);expect((await fetchDayBookData('2026-11-10')).cashExp).toBe(0);
 expect((await state.db.dayBook.findUnique({where:{businessDate:new Date('2026-11-10T00:00:00Z')}})).expenseTotal).toBe(0);
});
it('fuel expense source-link survives create, date move, delete, with actual-book recalculation',async()=>{
 const input={date:'2026-11-09',fuelType:'DIESEL',amount:100,paidAmount:100,isCan:true};
 const fuel=await saveFuelPurchase(input);expect((await fetchDayBookData('2026-11-09')).cashExp).toBe(100);
 await saveFuelPurchase({...input,id:fuel.id,date:'2026-11-10',amount:120,paidAmount:120},'1234');
 expect((await fetchDayBookData('2026-11-09')).cashExp).toBe(0);expect((await fetchDayBookData('2026-11-10')).cashExp).toBe(120);
 const old=await state.db.dayBook.findUnique({where:{businessDate:new Date('2026-11-09T00:00:00Z')}});expect(old.expenseTotal).toBe(0);
 await deleteFuelPurchase(fuel.id,'1234');expect(await state.db.expense.count()).toBe(0);expect(await state.db.dayBookExpenseEntry.count()).toBe(0);
 expect((await state.db.dayBook.findUnique({where:{businessDate:new Date('2026-11-10T00:00:00Z')}})).expenseTotal).toBe(0);
});
it('sale projection local business timestamp joins canonical book, preserving split and adjacent-day isolation',async()=>{
 const when=new Date('2026-11-09T00:00:00');
 await state.db.$transaction(async(tx:any)=>{await emitFinancialEvent(tx,{correlationId:'synthetic-sale',eventType:'SALE_CREATED',entityType:'Sale',entityId:'synthetic-sale',payload:{saleId:'synthetic-sale',saleDate:when.toISOString(),cashPaid:100,bankPaid:50,gPayPaid:20,remainingCredit:30,finalAmount:200} as any});});
 const book=await state.db.dayBook.findUnique({where:{businessDate:new Date('2026-11-09T00:00:00Z')}});
 expect(book).not.toBeNull();expect(book.cashSalesTotal).toBe(100);expect(book.bankSalesTotal).toBe(50);expect(book.gPaySalesTotal).toBe(20);expect(book.closingCashBalance).toBe(100);expect(book.closingBankBalance).toBe(70);expect(await state.db.dayBook.count()).toBe(1);
});

it('actual sale create/delete preserves Book/slip identity, CFT, split payments, credit and trip side effect',async()=>{
 await state.db.material.create({data:{id:'material',materialName:'Synthetic Rock',ratePerCft:20}});
 const created=await saveSale({saleDate:'2026-11-09',vehicleNumber:'TEST 001',partyName:'Synthetic Customer',materialId:'material',qty:10,ratePerCft:20,discountType:'percentage',discountValue:0,cashPaid:100,bankPaid:50,gPayPaid:20,bookNumber:'31',pageNumber:'1'});
 expect(created.success).toBe(true);const sale=created.data!;
 expect(sale.bookNumber).toBe(31);expect(sale.pageNumber).toBe(1);expect(sale.qty).toBe(10);expect(sale.finalAmount).toBe(200);expect(sale.remainingCredit).toBe(30);
 expect((await state.db.inventoryStock.findFirst()).quantity).toBe(-10);
 expect(await getLastBookPage()).toEqual({bookNumber:31,pageNumber:1});expect(await checkDuplicateSaleBookNumber(31,1)).toBe(true);
 expect((await state.db.vehicle.findUnique({where:{id:sale.vehicleId!}})).tripCount).toBe(sale.tripDelta);
 const view=await fetchDayBookData('2026-11-09');expect(view.cashSales).toBe(100);expect(view.bankSales).toBe(70);expect(view.creditSales).toBe(30);
 const book=await state.db.dayBook.findUnique({where:{businessDate:new Date('2026-11-09T00:00:00Z')}});expect(book.cashSalesTotal).toBe(100);expect(book.closingBankBalance).toBe(70);
 expect((await deleteSale(sale.id,'1234')).success).toBe(true);expect(await state.db.ledgerEntry.count()).toBe(0);
 expect((await state.db.dayBook.findUnique({where:{id:book.id}})).cashSalesTotal).toBe(0);
 expect((await state.db.vehicle.findUnique({where:{id:sale.vehicleId!}})).tripCount).toBe(0);
 expect((await state.db.inventoryStock.findFirst()).quantity).toBe(0);
});
it('legacy wrongly keyed book is not migrated; expense deletion recalculates actual projection target without creating a book',async()=>{
 expect((await saveExpense({expenseDate:'2026-11-09',expenseType:'LABOUR',amount:200})).success).toBe(true);const book=await state.db.dayBook.findFirst();const legacy=new Date('2026-11-07T18:30:00Z');
 await state.db.dayBook.update({where:{id:book.id},data:{businessDate:legacy}});
 const expense=await state.db.expense.findFirst();expect((await deleteExpense(expense.id,'1234')).success).toBe(true);
 const books=await state.db.dayBook.findMany();expect(books).toHaveLength(1);expect(books[0].id).toBe(book.id);expect(books[0].businessDate).toEqual(legacy);expect(books[0].expenseTotal).toBe(0);expect(books[0].closingCashBalance).toBe(0);
});
