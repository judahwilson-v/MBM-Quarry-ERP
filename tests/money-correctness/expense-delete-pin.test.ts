import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {PrismaClient} from '@prisma/client';import {copyFileSync,readFileSync} from 'node:fs';import ts from 'typescript';
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));
vi.mock('@/lib/sync/auto-sync',()=>({triggerAutoSync:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
// Auth is intentionally NOT mocked in this file.
import {saveExpense,deleteExpense} from '../../src/app/actions/expenses';
let n=0;
beforeEach(async()=>{const root=process.env.MBM_TEST_ROOT;if(!root)throw Error('isolated fixture required');const f=`${root}/pin-${++n}.db`;copyFileSync(`${root}/fixture.db`,f);state.db=new PrismaClient({datasources:{db:{url:`file:${f}`}}});vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});await state.db.globalSettings.create({data:{id:'default',deletePin:'424242',adminPin:'313131'}});});
afterEach(async()=>{vi.clearAllTimers();vi.useRealTimers();await state.db.$disconnect();});
const makeExpense=()=>saveExpense({expenseDate:'2026-11-09',expenseType:'LABOUR',amount:100});
it.each([undefined,'wrong-synthetic-pin'])('server rejects absent/wrong delete PIN %s without financial mutation',async(pin)=>{
 const row=await makeExpense();expect(row.success).toBe(true);const before=await state.db.dayBook.findFirst();
 expect((await deleteExpense(row.data!.id,pin)).success).toBe(false);
 expect(await state.db.expense.count()).toBe(1);expect(await state.db.dayBookExpenseEntry.count()).toBe(1);expect(await state.db.financialEvent.count()).toBe(1);expect(await state.db.dayBook.findFirst()).toEqual(before);
});
it('server accepts actual synthetic delete PIN, removes target expense/projection/event, recalculates book and records audit',async()=>{
 const row=await makeExpense();expect(row.success).toBe(true);expect((await deleteExpense(row.data!.id,'424242')).success).toBe(true);
 expect(await state.db.expense.count()).toBe(0);expect(await state.db.dayBookExpenseEntry.count()).toBe(0);expect(await state.db.financialEvent.count()).toBe(0);expect((await state.db.dayBook.findFirst()).expenseTotal).toBe(0);expect(await state.db.auditLog.count({where:{entityId:row.data!.id,action:'delete'}})).toBe(1);
});
it('expense UI passes entered password to the server action (AST contract, not a browser test)',()=>{
 const text=readFileSync('src/components/modules/expenses-page.tsx','utf8');const source=ts.createSourceFile('expenses-page.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const calls:ts.CallExpression[]=[];
 function visit(node:ts.Node){if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='deleteExpense')calls.push(node);ts.forEachChild(node,visit);}visit(source);
 expect(calls).toHaveLength(1);expect(calls[0].arguments).toHaveLength(3);expect(calls[0].arguments[1].getText(source)).toBe('password');
});
it.each([undefined,'wrong-synthetic-pin','424242'])('server edit refuses absent/wrong/delete-only PIN %s before linked or financial writes',async(pin)=>{
 const row=await makeExpense();expect(row.success).toBe(true);
 const before={expenses:await state.db.expense.findMany(),events:await state.db.financialEvent.findMany(),projections:await state.db.dayBookExpenseEntry.findMany(),books:await state.db.dayBook.findMany(),audit:await state.db.auditLog.findMany()};
 const result=await saveExpense({id:row.data!.id,expenseDate:'2026-11-10',expenseType:'LABOUR',amount:210,partyName:'Must Not Exist',vehicleNumber:'SHOULD NOT EXIST'},pin);
 expect(result.success).toBe(false);expect(await state.db.party.count()).toBe(0);expect(await state.db.vehicle.count()).toBe(0);
 expect({expenses:await state.db.expense.findMany(),events:await state.db.financialEvent.findMany(),projections:await state.db.dayBookExpenseEntry.findMany(),books:await state.db.dayBook.findMany(),audit:await state.db.auditLog.findMany()}).toEqual(before);
});
it('actual synthetic edit PIN updates the expense while preserving canonical business date, type and financial identities',async()=>{
 const row=await makeExpense();expect(row.success).toBe(true);const event=await state.db.financialEvent.findFirst();const projection=await state.db.dayBookExpenseEntry.findFirst();
 expect((await saveExpense({id:row.data!.id,expenseDate:'2026-11-09',expenseType:'LABOUR',amount:210},'313131')).success).toBe(true);
 expect((await state.db.expense.findFirst()).amount).toBe(210);expect((await state.db.financialEvent.findFirst()).eventId).toBe(event.eventId);expect((await state.db.dayBookExpenseEntry.findFirst()).id).toBe(projection.id);expect((await state.db.dayBook.findFirst()).expenseTotal).toBe(210);
 expect(await state.db.auditLog.count({where:{entityId:row.data!.id,action:'update'}})).toBe(1);
});
it('edit form forwards the entered edit password to server action (AST contract, not a browser test)',()=>{
 const text=readFileSync('src/components/modules/expense-entry-form.tsx','utf8');const source=ts.createSourceFile('form.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const calls:ts.CallExpression[]=[];
 function visit(node:ts.Node){if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='saveExpense')calls.push(node);ts.forEachChild(node,visit);}visit(source);
 expect(calls).toHaveLength(1);expect(calls[0].arguments).toHaveLength(3);expect(calls[0].arguments[1].getText(source)).toBe('editPassword');
});
