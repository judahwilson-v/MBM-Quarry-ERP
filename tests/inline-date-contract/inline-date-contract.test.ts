import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {copyFileSync,readFileSync} from 'node:fs';
import ts from 'typescript';
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));
vi.mock('@/lib/sync/auto-sync',()=>({triggerAutoSync:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
// Auth is intentionally NOT mocked: real verifyEditPassword runs against the
// synthetic GlobalSettings row.
import {saveSale} from '../../src/app/actions/sales';
import {saveIncomingBoulder} from '../../src/app/actions/purchases';

let n=0;
beforeEach(async()=>{
 const root=process.env.MBM_TEST_ROOT;if(!root)throw Error('isolated fixture required');
 const f=`${root}/inline-${++n}.db`;copyFileSync(`${root}/fixture.db`,f);
 state.db=new PrismaClient({datasources:{db:{url:`file:${f}`}}});
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 await state.db.globalSettings.create({data:{id:'default',deletePin:'424242',adminPin:'313131'}});
 await state.db.material.create({data:{id:'material',materialName:'Synthetic Rock',ratePerCft:20}});
});
afterEach(async()=>{vi.clearAllTimers();vi.useRealTimers();await state.db.$disconnect();});

const saleInput={saleDate:'2026-11-10',vehicleNumber:'ORIG 01',partyName:'Original Party',materialId:'material',qty:10,ratePerCft:20,discountType:'percentage' as const,discountValue:0,cashPaid:100,bankPaid:50,gPayPaid:20,bookNumber:'31',pageNumber:'1'};
const boulderInput={date:'2026-11-09',vehicleNumber:'ORIG 02',partyName:'Original Supplier',qty:10,rockRate:20,cashPaid:0,bankPaid:200,gPayPaid:0,vehicleRent:0,combinedPayment:false,time:'12:00',remarks:'Synthetic',bookNumber:'31',pageNumber:'3'} as any;

it('inline contract: sale remarks edit resending the serialized stored saleDate succeeds and preserves the exact stored instant',async()=>{
 const created=await saveSale(saleInput);expect(created.success).toBe(true);
 const row=await state.db.outgoingSale.findUnique({where:{id:created.data!.id}});
 const iso=row.saleDate.toISOString(); // what the client receives and the inline caller resends
 const partiesBefore=await state.db.party.count();const vehiclesBefore=await state.db.vehicle.count();
 const res=await saveSale({id:row.id,saleDate:iso,vehicleNumber:row.vehicleNumber,partyName:row.partyName,materialId:row.materialId,qty:row.qty,ratePerCft:row.ratePerCft,cashPaid:row.cashPaid,bankPaid:row.bankPaid,gPayPaid:row.gPayPaid,discountType:row.discountType,discountValue:row.discountValue,remarks:'Synthetic inline sale remarks',bookNumber:row.bookNumber,pageNumber:row.pageNumber} as any,'313131');
 expect(res.success,JSON.stringify(res)).toBe(true);
 const after=await state.db.outgoingSale.findUnique({where:{id:row.id}});
 expect(after.remarks).toBe('Synthetic inline sale remarks');
 expect(after.saleDate.getTime(),'stored instant must not shift a day').toBe(row.saleDate.getTime());
 expect(await state.db.party.count()).toBe(partiesBefore);
 expect(await state.db.vehicle.count()).toBe(vehiclesBefore);
});

it('inline contract: boulder remarks edit resending the serialized stored date succeeds and preserves the exact stored instant',async()=>{
 const bc=await saveIncomingBoulder(boulderInput);expect((bc as any).id).toBeTruthy();
 const row=await state.db.incomingBoulder.findFirst();
 const iso=row.date.toISOString();
 const res=await saveIncomingBoulder({id:row.id,date:iso,vehicleNumber:row.vehicleNumber,partyName:row.partyName,qty:row.qty,rockRate:row.rockRate,cashPaid:row.cashPaid,bankPaid:row.bankPaid,gPayPaid:row.gPayPaid,vehicleRent:row.vehicleRent,combinedPayment:row.combinedPayment,time:row.time,remarks:'Synthetic inline boulder remarks',bookNumber:row.bookNumber,pageNumber:row.pageNumber} as any,'313131');
 expect((res as any).error,JSON.stringify(res)).toBeUndefined();
 const after=await state.db.incomingBoulder.findUnique({where:{id:row.id}});
 expect(after.remarks).toBe('Synthetic inline boulder remarks');
 expect(after.date.getTime(),'stored instant must not shift a day').toBe(row.date.getTime());
 expect(await state.db.party.count()).toBe(1);
 expect(await state.db.vehicle.count()).toBe(1);
});

it('inline contract: a second round-trip through the serialized value remains on the same instant',async()=>{
 const created=await saveSale(saleInput);expect(created.success).toBe(true);
 const row=await state.db.outgoingSale.findUnique({where:{id:created.data!.id}});
 const first=await saveSale({id:row.id,saleDate:row.saleDate.toISOString(),vehicleNumber:row.vehicleNumber,partyName:row.partyName,materialId:row.materialId,qty:row.qty,ratePerCft:row.ratePerCft,cashPaid:row.cashPaid,bankPaid:row.bankPaid,gPayPaid:row.gPayPaid,discountType:row.discountType,discountValue:row.discountValue,remarks:'first',bookNumber:row.bookNumber,pageNumber:row.pageNumber} as any,'313131');
 expect(first.success,JSON.stringify(first)).toBe(true);
 const mid=await state.db.outgoingSale.findUnique({where:{id:row.id}});
 const second=await saveSale({id:row.id,saleDate:mid.saleDate.toISOString(),vehicleNumber:mid.vehicleNumber,partyName:mid.partyName,materialId:mid.materialId,qty:mid.qty,ratePerCft:mid.ratePerCft,cashPaid:mid.cashPaid,bankPaid:mid.bankPaid,gPayPaid:mid.gPayPaid,discountType:mid.discountType,discountValue:mid.discountValue,remarks:'second',bookNumber:mid.bookNumber,pageNumber:mid.pageNumber} as any,'313131');
 expect(second.success,JSON.stringify(second)).toBe(true);
 const after=await state.db.outgoingSale.findUnique({where:{id:row.id}});
 expect(after.saleDate.getTime()).toBe(row.saleDate.getTime());
 expect(after.remarks).toBe('second');
});

it('cross-host: an existing India-midnight sale instant resent by a remarks edit is preserved exactly on any host',async()=>{
 const indiaMidnight=new Date('2026-11-09T18:30:00.000Z'); // 2026-11-10 00:00 in Asia/Kolkata
 const created=await saveSale({...saleInput,saleDate:indiaMidnight.toISOString()} as any);
 expect(created.success,JSON.stringify(created)).toBe(true);
 const row=await state.db.outgoingSale.findUnique({where:{id:created.data!.id}});
 expect(row.saleDate.getTime(),'supplied serialized instant must be stored exactly').toBe(indiaMidnight.getTime());
 const res=await saveSale({id:row.id,saleDate:row.saleDate.toISOString(),vehicleNumber:row.vehicleNumber,partyName:row.partyName,materialId:row.materialId,qty:row.qty,ratePerCft:row.ratePerCft,cashPaid:row.cashPaid,bankPaid:row.bankPaid,gPayPaid:row.gPayPaid,discountType:row.discountType,discountValue:row.discountValue,remarks:'Synthetic cross-host remarks',bookNumber:row.bookNumber,pageNumber:row.pageNumber} as any,'313131');
 expect(res.success,JSON.stringify(res)).toBe(true);
 const after=await state.db.outgoingSale.findUnique({where:{id:row.id}});
 expect(after.remarks).toBe('Synthetic cross-host remarks');
 expect(after.saleDate.getTime(),'a resent stored instant must never be normalized to host-local midnight').toBe(indiaMidnight.getTime());
});

it('cross-host: an existing India-midnight boulder instant resent by a remarks edit is preserved exactly on any host',async()=>{
 const indiaMidnight=new Date('2026-11-08T18:30:00.000Z'); // 2026-11-09 00:00 in Asia/Kolkata
 const bc=await saveIncomingBoulder({...boulderInput,date:indiaMidnight.toISOString()} as any);
 expect((bc as any).error,JSON.stringify(bc)).toBeUndefined();
 const row=await state.db.incomingBoulder.findFirst();
 expect(row.date.getTime(),'supplied serialized instant must be stored exactly').toBe(indiaMidnight.getTime());
 const res=await saveIncomingBoulder({id:row.id,date:row.date.toISOString(),vehicleNumber:row.vehicleNumber,partyName:row.partyName,qty:row.qty,rockRate:row.rockRate,cashPaid:row.cashPaid,bankPaid:row.bankPaid,gPayPaid:row.gPayPaid,vehicleRent:row.vehicleRent,combinedPayment:row.combinedPayment,time:row.time,remarks:'Synthetic cross-host boulder remarks',bookNumber:row.bookNumber,pageNumber:row.pageNumber} as any,'313131');
 expect((res as any).error,JSON.stringify(res)).toBeUndefined();
 const after=await state.db.incomingBoulder.findUnique({where:{id:row.id}});
 expect(after.remarks).toBe('Synthetic cross-host boulder remarks');
 expect(after.date.getTime(),'a resent stored instant must never be normalized to host-local midnight').toBe(indiaMidnight.getTime());
});

it('characterization: a date-only label still stores local-midnight, unchanged behavior',async()=>{
 const created=await saveSale(saleInput);expect(created.success).toBe(true);
 const row=await state.db.outgoingSale.findUnique({where:{id:created.data!.id}});
 expect(row.saleDate.getTime()).toBe(new Date('2026-11-10T00:00:00').getTime());
});

it('refusal: timezone-less datetime, bare year, and bare number strings stay rejected (no input expansion)',async()=>{
 for(const bad of ['2026-11-10T12:34:56','2026','0']){
  const res=await saveIncomingBoulder({...boulderInput,date:bad} as any);
  expect((res as any).success??false,`boulder must still reject ${bad}`).toBe(false);
  expect(JSON.stringify(res)).toContain('Date is invalid');
  const resSale=await saveSale({...saleInput,saleDate:bad} as any);
  expect(resSale.success,`sale must still reject ${bad}`).toBe(false);
  expect(JSON.stringify(resSale)).toContain('Date is invalid');
 }
 expect(await state.db.incomingBoulder.count()).toBe(0);
 expect(await state.db.outgoingSale.count()).toBe(0);
 expect(await state.db.party.count()).toBe(0);
 expect(await state.db.vehicle.count()).toBe(0);
});

it('refusal: a syntactically qualified but invalid datetime still rejects with no writes',async()=>{
 const res=await saveIncomingBoulder({...boulderInput,date:'2026-11-09T18:30:00+25:00'} as any);
 expect((res as any).success??false).toBe(false);
 expect(JSON.stringify(res)).toContain('Date is invalid');
 expect(await state.db.incomingBoulder.count()).toBe(0);
});

it('characterization: a garbage date string still refuses honestly with no writes',async()=>{
 const res=await saveIncomingBoulder({...boulderInput,date:'not-a-real-date'} as any);
 expect((res as any).success??false).toBe(false);
 expect(JSON.stringify(res)).toContain('Date is invalid');
 expect(await state.db.incomingBoulder.count()).toBe(0);
 expect(await state.db.party.count()).toBe(0);
});

it('AST contract: the sale inline caller resends bookNumber and pageNumber (Zod optionalNumber rejects absent keys)',()=>{
 const file='src/components/modules/sales-page.tsx';
 const text=readFileSync(file,'utf8');
 const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let handler:ts.FunctionDeclaration|undefined;
 function findFn(node:ts.Node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='handleInlineSave')handler=node;ts.forEachChild(node,findFn);}findFn(source);
 expect(handler,'handleInlineSave found').toBeTruthy();
 const body=handler!.getText();
 expect(body.includes('bookNumber'),'inline payload carries bookNumber').toBe(true);
 expect(body.includes('pageNumber'),'inline payload carries pageNumber').toBe(true);
});

it('AST contract: both server parsers accept only the date-only label and the timezone-qualified serialized instant shapes',()=>{
 for(const file of ['src/app/actions/purchases.ts','src/lib/sales-engine.ts'] as const){
  const text=readFileSync(file,'utf8');
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  let parser:ts.FunctionDeclaration|undefined;
  function findFn(node:ts.Node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='parseDateInput')parser=node;ts.forEachChild(node,findFn);}findFn(source);
  expect(parser,`${file} parseDateInput found`).toBeTruthy();
  const body=parser!.getText();
  expect(body.includes('^\\d{4}-\\d{2}-\\d{2}$'),`${file} tests the date-only label shape`).toBe(true);
  expect(body.includes('(Z|[+-]'),`${file} requires a timezone designator on datetime strings`).toBe(true);
  expect(body.includes('businessDateLabel'),`${file} must NOT reduce stored instants to a host-local day`).toBe(false);
  expect((body.match(/throw new Error\("Date is invalid\."\)/g) ?? []).length >= 1,`${file} keeps the baseline rejection`).toBe(true);
 }
});

