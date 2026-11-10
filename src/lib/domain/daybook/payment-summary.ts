import type {Prisma} from '@prisma/client';
import {businessDayBounds} from './business-date';
import {expenseMovement,type ExpenseFact} from './expense-payments';
import {splitPayment,transfer,closeBook,type Movement} from './cash-movements';
// Shared non-sale payment source loader. Sale totals are supplied by each
// existing caller; this does not settle F06 event/replay correction rules.
export async function paymentCashBook(tx:Prisma.TransactionClient,label:string,openingCash:number,openingBank:number,dayBookId:string|undefined,saleCash:number,saleBank:number){
 const {start,endExclusive}=businessDayBounds(label);const within={gte:start,lt:endExclusive};

 const collections=await tx.partyCollection.findMany({where:{collectionDate:within}});
 const payments=await tx.partyPayment.findMany({where:{paymentDate:within}});
 const transfers=await tx.cashTransfer.findMany({where:{date:within}});
 const entries=dayBookId?await tx.dayBookExpenseEntry.findMany({where:{dayBookId}}):[];
 const events=await tx.financialEvent.findMany({where:{eventId:{in:entries.map(e=>e.sourceEventId)}}});
 const facts=await tx.expense.findMany({where:{id:{in:events.filter(e=>e.entityType==='Expense').map(e=>e.entityId)}}});
 const fuel=await tx.fuelPurchase.findMany({where:{sourceEventId:{in:facts.map(e=>e.sourceEventId)}}});
 const expenseById=new Map<string,ExpenseFact>(facts.map(e=>[e.id,e]));const eventById=new Map(events.map(e=>[e.eventId,e]));const fuelBySource=new Map(fuel.map(e=>[e.sourceEventId,e]));
 const movements:Movement[]=[];const unresolved:string[]=[];
 movements.push({source:'SaleReceipts',id:label,cashDelta:saleCash,bankDelta:saleBank});
 for(const e of collections)movements.push(splitPayment('PartyCollection',e.id,'RECEIVED',e.cashPaid,e.bankPaid,e.gPayPaid));
 for(const e of payments)movements.push(splitPayment('PartyPayment',e.id,'PAID',e.cashPaid,e.bankPaid,e.gPayPaid));
 for(const e of transfers){if(e.type!=='CASH_TO_BANK'&&e.type!=='BANK_TO_CASH'){unresolved.push('Transfer direction is unresolved');continue;}movements.push(transfer('CashTransfer',e.id,e.type,e.amount));}
 for(const e of entries){const event=eventById.get(e.sourceEventId);const expense=event?expenseById.get(event.entityId):undefined;try{movements.push(expenseMovement(e,event,expense,expense?fuelBySource.get(expense.sourceEventId):undefined));}catch(error){unresolved.push(error instanceof Error?error.message:'Expense provenance is unresolved');}}
 const expenseTotal=entries.reduce((sum,e)=>sum+e.amount,0);
 if(unresolved.length)return {available:false as const,unresolved,expenseTotal,movements,entries,collections,payments,transfers};
 return {available:true as const,...closeBook(openingCash,openingBank,movements),unresolved,expenseTotal,movements,entries,collections,payments,transfers};
}
