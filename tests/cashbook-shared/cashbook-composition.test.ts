import {beforeEach,afterEach,it,expect,vi} from 'vitest';import {PrismaClient} from '@prisma/client';import {copyFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null as any}));vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));vi.mock('@/lib/sync/auto-sync',()=>({triggerAutoSync:vi.fn()}));vi.mock('@/app/actions/auth',()=>({verifyEditPassword:async()=>true,requireActor:async()=>null,isEnrollmentComplete:async()=>false}));vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {deletePartyCollection,deletePartyPayment,listPartiesWithBalances,savePartyCollection,savePartyPayment} from '../../src/app/actions/credits';import {saveDayBookOpeningBalances} from '../../src/app/actions/daybook_offline';import {fetchDayBookData,saveCashTransfer} from '../../src/lib/daybook-actions';import {saveFuelPurchase} from '../../src/app/actions/fuel';import {saveIncomingBoulder} from '../../src/app/actions/purchases';
let n=0;beforeEach(async()=>{const root=process.env.MBM_TEST_ROOT;if(!root)throw Error('isolated fixture required');const f=`${root}/composition-modes-${++n}.db`;copyFileSync(`${root}/fixture.db`,f);state.db=new PrismaClient({datasources:{db:{url:`file:${f}`}}});vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});await state.db.party.create({data:{partyName:'Synthetic Party'}});await saveDayBookOpeningBalances({businessDate:'2026-11-09',openingCashBalance:1000,openingBankBalance:500});});afterEach(async()=>{vi.clearAllTimers();vi.useRealTimers();await state.db.$disconnect();});
async function closing(label:string,cash:number,bank:number){const view=await fetchDayBookData('2026-11-09');const stored=await state.db.dayBook.findFirst();console.log(label,JSON.stringify({view,stored}));expect(view.closingCash).toBe(cash);expect(view.closingBank).toBe(bank);expect(stored.closingCashBalance).toBe(cash);expect(stored.closingBankBalance).toBe(bank);}
it('ISS01 desired collection split cash70/bank20/gpay10 updates both visible and stored closing',async()=>{const result=await savePartyCollection({partyName:'Synthetic Party',collectionDate:'2026-11-09',cashPaid:70,bankPaid:20,gPayPaid:10});expect((result as any).eventId).toBeTruthy();await closing('COLLECTION_ACTUAL',1070,530);});
it('F07 desired supplier payment split cash70/bank20/gpay10 debits visible and stored closing',async()=>{const result=await savePartyPayment({partyName:'Synthetic Party',paymentDate:'2026-11-09',cashPaid:70,bankPaid:20,gPayPaid:10});expect((result as any).eventId).toBeTruthy();await closing('SUPPLIER_PAYMENT_ACTUAL',930,470);});
it.each([['CASH_TO_BANK',900,600],['BANK_TO_CASH',1100,400]])('desired two-sided transfer %s is not expense/income and updates stored closing',async(type,cash,bank)=>{await saveCashTransfer({submissionId:type==='CASH_TO_BANK'?'33333333-3333-4333-8333-333333333333':'44444444-4444-4444-8444-444444444444',type:type as string,amount:100,time:'12:00',date:'2026-11-09',remarks:'Synthetic transfer',userName:'Synthetic QA'});await closing('TRANSFER_ACTUAL',cash as number,bank as number);expect(await state.db.expense.count()).toBe(0);});
it('F07 desired fully credit fuel purchase has no cash outflow until payment',async()=>{const fuel=await saveFuelPurchase({date:'2026-11-09',fuelType:'DIESEL',amount:100,paidAmount:0,isCan:true});expect(fuel.creditAmount).toBe(100);await closing('FUEL_CREDIT_ACTUAL',1000,500);});
it('F07 desired immediate boulder bank payment200 debits bank not cash',async()=>{const row=await saveIncomingBoulder({date:'2026-11-09',vehicleNumber:'SYNTHETIC 01',partyName:'Synthetic Party',qty:10,rockRate:20,cashPaid:0,bankPaid:200,gPayPaid:0,vehicleRent:0,combinedPayment:false,time:'12:00',remarks:'Synthetic bank payment',bookNumber:'31',pageNumber:'3'} as any);console.log('BOULDER_RESULT',JSON.stringify(row));expect((row as any).id).toBeTruthy();await closing('BOULDER_BANK_ACTUAL',1000,300);});

it('T03 characterization: deleting a supplier payment reverses closing, balance and events (existing behavior pinned, NOT endorsed)',async()=>{
 const result=await savePartyPayment({partyName:'Synthetic Party',paymentDate:'2026-11-09',cashPaid:200,bankPaid:0,gPayPaid:0});
 expect((result as any).eventId).toBeTruthy();
 await closing('PAYMENT_BEFORE_DELETE',800,500);
 let rows=await listPartiesWithBalances() as any[];
 expect(rows.find(r=>r.partyName==='Synthetic Party').balance).toBe(200);
 const payment=await state.db.partyPayment.findFirstOrThrow({where:{partyName:'Synthetic Party'}});
 expect(await state.db.financialEvent.count({where:{entityId:payment.id}})).toBeGreaterThan(0);
 const del=await deletePartyPayment(payment.id,'synthetic-pin') as any;
 expect(del.success).toBe(true);
 await closing('PAYMENT_AFTER_DELETE',1000,500);
 rows=await listPartiesWithBalances() as any[];
 expect(rows.find(r=>r.partyName==='Synthetic Party')).toBeUndefined();
 expect(await state.db.partyPayment.count()).toBe(0);
 // F04-documented behavior pinned as characterization: deleting the record also
 // removes its financial events. Pinning is not endorsement of event deletion.
 expect(await state.db.financialEvent.count({where:{entityId:payment.id}})).toBe(0);
 expect(await state.db.auditLog.findFirst({where:{entityName:'PartyPayment',entityId:payment.id,action:'delete'}})).not.toBeNull();
});

it('T03 characterization: deleting a customer collection reverses closing, balance and events (existing behavior pinned, NOT endorsed)',async()=>{
 const result=await savePartyCollection({partyName:'Synthetic Party',collectionDate:'2026-11-09',cashPaid:120,bankPaid:0,gPayPaid:0});
 expect((result as any).eventId).toBeTruthy();
 await closing('COLLECTION_BEFORE_DELETE',1120,500);
 let rows=await listPartiesWithBalances() as any[];
 expect(rows.find(r=>r.partyName==='Synthetic Party').balance).toBe(-120);
 const collection=await state.db.partyCollection.findFirstOrThrow({where:{partyName:'Synthetic Party'}});
 expect(await state.db.financialEvent.count({where:{entityId:collection.id}})).toBeGreaterThan(0);
 const del=await deletePartyCollection(collection.id,'synthetic-pin') as any;
 expect(del.success).toBe(true);
 await closing('COLLECTION_AFTER_DELETE',1000,500);
 rows=await listPartiesWithBalances() as any[];
 expect(rows.find(r=>r.partyName==='Synthetic Party')).toBeUndefined();
 expect(await state.db.partyCollection.count()).toBe(0);
 expect(await state.db.financialEvent.count({where:{entityId:collection.id}})).toBe(0);
 expect(await state.db.auditLog.findFirst({where:{entityName:'PartyCollection',entityId:collection.id,action:'delete'}})).not.toBeNull();
});
