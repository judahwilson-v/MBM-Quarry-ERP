import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';import {copyFileSync,readFileSync} from 'node:fs';import ts from 'typescript';
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));
vi.mock('@/lib/sync/auto-sync',()=>({triggerAutoSync:vi.fn()}));
vi.mock('@/app/actions/auth',()=>({verifyEditPassword:async()=>true,requireActor:async()=>null,isEnrollmentComplete:async()=>false}));
import {saveEmployeeLedgerEntry,getEmployeeLedger} from '../../src/app/actions/employees';
import {saveFuelPurchase} from '../../src/app/actions/fuel';
import {saveExpense,listExpenses,deleteExpense} from '../../src/app/actions/expenses';
import {fetchDayBookData} from '../../src/lib/daybook-actions';
let n=0;
beforeEach(async()=>{const root=process.env.MBM_TEST_ROOT;if(!root)throw Error('isolated fixture required');const f=`${root}/edit-date-${++n}.db`;copyFileSync(`${root}/fixture.db`,f);state.db=new PrismaClient({datasources:{db:{url:`file:${f}`}}});vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});await state.db.employee.create({data:{id:'worker',name:'Synthetic edit dates'}});});
afterEach(async()=>{vi.clearAllTimers();vi.useRealTimers();await state.db.$disconnect();});
it('manual expense retains assigned Nov9 business date/type and same identity on amount-only edit',async()=>{
 expect((await saveExpense({expenseDate:'2026-11-09',expenseType:'LABOUR',amount:200})).success).toBe(true);
 const listed=(await listExpenses())[0];expect(listed.businessDateLabel).toBe('2026-11-09');
 const before=await state.db.dayBookExpenseEntry.findFirst();const event=await state.db.financialEvent.findFirst();
 expect((await saveExpense({...listed,expenseDate:listed.businessDateLabel,amount:210},'test-edit-pin')).success).toBe(true);
 const after=await state.db.dayBookExpenseEntry.findFirst();expect(after.id).toBe(before.id);expect(after.dayBookId).toBe(before.dayBookId);expect(after.sourceEventId).toBe(before.sourceEventId);expect((await state.db.financialEvent.findFirst()).eventId).toBe(event.eventId);
 const saved=(await listExpenses())[0];expect(saved.businessDateLabel).toBe('2026-11-09');expect(saved.expenseType).toBe(listed.expenseType);expect(saved.id).toBe(listed.id);
 expect((await fetchDayBookData('2026-11-09')).cashExp).toBe(210);expect((await fetchDayBookData('2026-11-08')).cashExp).toBe(0);expect(await state.db.dayBook.count()).toBe(1);
});
it('worker advance refuses mirrored expense edit/delete, keeping ledger, balance and Day Book consistent',async()=>{
 await saveEmployeeLedgerEntry({employeeId:'worker',date:'2026-11-09',type:'ADVANCE',amount:200,cashPaid:200});
 const listed=(await listExpenses())[0];expect(listed.businessDateLabel).toBe('2026-11-09');expect(listed.expenseType).toBe('EMPLOYEE_ADVANCE');
 const refusedEdit=await saveExpense({...listed,expenseDate:listed.businessDateLabel,amount:210,paymentMode:'BANK'},'test-edit-pin');
 expect(refusedEdit.success).toBe(false);expect(refusedEdit.error).toMatch(/does not yet support correcting/);
 const refusedDelete=await deleteExpense(listed.id,'test-edit-pin');
 expect(refusedDelete.success).toBe(false);expect(refusedDelete.error).toMatch(/does not yet support correcting/);
 const kept=(await listExpenses())[0];expect(kept.amount).toBe(200);expect(kept.paymentMode).toBe('CASH');expect(kept.expenseType).toBe('EMPLOYEE_ADVANCE');
 expect((await fetchDayBookData('2026-11-09')).cashExp).toBe(200);expect((await fetchDayBookData('2026-11-08')).cashExp).toBe(0);
 const ledger=await getEmployeeLedger('worker');expect(ledger).toHaveLength(1);expect(ledger[0].amount).toBe(200);expect(ledger[0].balance).toBe(-200);
 await saveEmployeeLedgerEntry({employeeId:'worker',date:'2026-11-09',type:'SALARY',amount:100});
 const corrected=await getEmployeeLedger('worker');expect(corrected).toHaveLength(2);expect(corrected[1].balance).toBe(-100);
});
it('fuel purchase refuses mirrored expense edit/delete and keeps the canonical fuel edit path',async()=>{
 await saveFuelPurchase({date:'2026-11-09',fuelType:'DIESEL',amount:200,paidAmount:200,isCan:true});
 const listed=(await listExpenses())[0];expect(listed.businessDateLabel).toBe('2026-11-09');
 const before=await state.db.dayBookExpenseEntry.findFirst();const event=await state.db.financialEvent.findFirst();
 const refusedEdit=await saveExpense({...listed,expenseDate:listed.businessDateLabel,amount:210},'test-edit-pin');
 expect(refusedEdit.success).toBe(false);expect(refusedEdit.error).toMatch(/Fuel Management/);
 const refusedDelete=await deleteExpense(listed.id,'test-edit-pin');
 expect(refusedDelete.success).toBe(false);expect(refusedDelete.error).toMatch(/Fuel Management/);
 expect((await state.db.expense.findFirst()).amount).toBe(200);expect((await fetchDayBookData('2026-11-09')).cashExp).toBe(200);
 const fuel=await state.db.fuelPurchase.findFirst();
 await saveFuelPurchase({id:fuel.id,date:'2026-11-09',fuelType:'DIESEL',amount:210,paidAmount:210,isCan:true},'test-edit-pin');
 const after=await state.db.dayBookExpenseEntry.findFirst();expect(after.id).toBe(before.id);expect(after.dayBookId).toBe(before.dayBookId);expect(after.sourceEventId).toBe(before.sourceEventId);expect((await state.db.financialEvent.findFirst()).eventId).toBe(event.eventId);
 const saved=(await listExpenses())[0];expect(saved.businessDateLabel).toBe('2026-11-09');expect(saved.expenseType).toBe(listed.expenseType);expect(saved.id).toBe(listed.id);expect(saved.amount).toBe(210);
 expect((await fetchDayBookData('2026-11-09')).cashExp).toBe(210);expect((await fetchDayBookData('2026-11-08')).cashExp).toBe(0);expect(await state.db.dayBook.count()).toBe(1);
});
it('missing projection supplies no guessed date',async()=>{
 await state.db.expense.create({data:{expenseDate:new Date('2026-11-09T00:00:00Z'),expenseType:'SYNTHETIC_UNKNOWN',amount:10,sourceEventId:'synthetic-unlinked'}});
 expect((await listExpenses())[0].businessDateLabel).toBeNull();
});
it('noncanonical legacy target supplies no guessed date and does not migrate stored key',async()=>{
 await saveEmployeeLedgerEntry({employeeId:'worker',date:'2026-11-09',type:'ADVANCE',amount:200,cashPaid:200});const b=await state.db.dayBook.findFirst();const key=new Date('2026-11-07T18:30:00Z');await state.db.dayBook.update({where:{id:b.id},data:{businessDate:key}});
 expect((await listExpenses())[0].businessDateLabel).toBeNull();expect((await state.db.dayBook.findFirst()).businessDate).toEqual(key);
});
it('conflicting assigned canonical dates supply no guessed date',async()=>{
 expect((await saveExpense({expenseDate:'2026-11-09',expenseType:'LABOUR',amount:200})).success).toBe(true);
 const expense=await state.db.expense.findFirst();const book=await state.db.dayBook.create({data:{businessDate:new Date('2026-11-10T00:00:00Z')}});
 await state.db.financialEvent.create({data:{eventId:'synthetic-conflict',correlationId:expense.id,entityType:'Expense',entityId:expense.id,eventType:'EXPENSE_CREATED',payload:{}}});
 await state.db.dayBookExpenseEntry.create({data:{dayBookId:book.id,sourceEventId:'synthetic-conflict',entryDate:new Date('2026-11-10T00:00:00Z'),expenseType:'LABOUR',amount:200}});
 expect((await listExpenses())[0].businessDateLabel).toBeNull();
});
it('form source uses authoritative label without timestamp reinterpretation and offers saved nonstandard type',()=>{
 const text=readFileSync('src/components/modules/expense-entry-form.tsx','utf8');const source=ts.createSourceFile('form.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const values:string[]=[];
 function visit(node:ts.Node){if(ts.isPropertyAssignment(node)&&node.name.getText(source)==='expenseDate')values.push(node.initializer.getText(source));ts.forEachChild(node,visit);}visit(source);
 expect(values).toContain('editingExpense.businessDateLabel ?? ""');expect(text).toContain('<option value={form.expenseType}>{form.expenseType} (saved type)</option>');
});
