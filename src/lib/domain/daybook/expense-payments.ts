import {explicitExpense,splitPayment,type Movement} from './cash-movements';
export type ExpenseProjection = {id:string;sourceEventId:string;amount:number};
export type EventFact = {eventId:string;eventType:string;entityType:string;entityId:string;payload:unknown};
export type ExpenseFact = {id:string;sourceEventId:string;amount:number;paymentMode:string};
export type FuelFact = {id:string;sourceEventId:string;amount:number;paidAmount:number};
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expense payment provenance is missing');return value as Record<string,unknown>;}
function number(value:unknown):number{if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('Expense payment amount is unresolved');return value;}
function same(a:number,b:number){return Math.abs(a-b)<1e-7;}
// Resolve exact payment facts without changing history or guessing a
// historical source from descriptions.
export function expenseMovement(entry:ExpenseProjection,event:EventFact|undefined,expense?:ExpenseFact,fuel?:FuelFact):Movement {
 if(!event||event.eventId!==entry.sourceEventId)throw Error('Expense event linkage is missing');
 const payload=object(event.payload);if(!same(number(payload.amount),number(entry.amount)))throw Error('Expense projection differs from source fact');
 if(event.eventType==='EXPENSE_CREATED'){
  if(event.entityType!=='Expense'||!expense||expense.id!==event.entityId)throw Error('Expense entity linkage is missing');
  if(!same(expense.amount,entry.amount)||payload.paymentMode!==expense.paymentMode)throw Error('Expense payment facts disagree');
  if(fuel){
   if(fuel.sourceEventId!==expense.sourceEventId)throw Error('Fuel linkage differs');
   const expected=fuel.paidAmount>0?fuel.paidAmount:fuel.amount;
   if(!same(expected,expense.amount)||expense.paymentMode!=='CASH')throw Error('Linked fuel payment needs reconciliation');
   return splitPayment('DayBookExpenseEntry',entry.id,'PAID',number(fuel.paidAmount),0,0);
  }
  return explicitExpense('DayBookExpenseEntry',entry.id,entry.amount,expense.paymentMode);
 }
 if(event.eventType==='DAY_BOOK_EXPENSE_CREATED'){
  if(payload.paymentBreakdown){
   const split=object(payload.paymentBreakdown);const cash=number(split.cashPaid),bank=number(split.bankPaid),gpay=number(split.gPayPaid);
   if(!same(cash+bank+gpay,entry.amount))throw Error('Immediate payment split differs from recorded amount');
   if(typeof payload.sourceEntityId!=='string'||!payload.sourceEntityId)throw Error('Immediate payment source identity is missing');
   return splitPayment('DayBookExpenseEntry',entry.id,'PAID',cash,bank,gpay);
  }
  if(payload.paymentMode==='CASH'&&payload.sourceKind==='MANUAL_CASH')return explicitExpense('DayBookExpenseEntry',entry.id,entry.amount,'CASH');
  throw Error('Legacy Day Book payment split is unresolved');
 }
 throw Error('Unsupported expense source event');
}
