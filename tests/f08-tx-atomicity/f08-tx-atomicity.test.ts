import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {copyFileSync,readFileSync} from 'node:fs';
import ts from 'typescript';
const state=vi.hoisted(()=>({db:null as any,failLedger:false}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));
vi.mock('@/lib/sync/auto-sync',()=>({triggerAutoSync:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
// Auth is intentionally NOT mocked: the real verifyEditPassword runs against the
// synthetic GlobalSettings row, so wrong-PIN paths exercise the production check.
// Fault injection for rollback proofs: the ledger recalculation runs INSIDE the
// sale/purchase transaction, so forcing it to fail proves whether master upserts
// that preceded the transaction commit anyway.
vi.mock('@/lib/domain/ledger/party-ledger-service',async()=>{
 const actual=await vi.importActual<any>('@/lib/domain/ledger/party-ledger-service');
 return {...actual,recalculatePartyLedger:async(...args:any[])=>{if(state.failLedger)throw new Error('synthetic in-transaction fault');return actual.recalculatePartyLedger(...args);}};
});
import {saveSale} from '../../src/app/actions/sales';
import {saveIncomingBoulder} from '../../src/app/actions/purchases';

let n=0;
beforeEach(async()=>{
 const root=process.env.MBM_TEST_ROOT;if(!root)throw Error('isolated fixture required');
 const f=`${root}/f08-${++n}.db`;copyFileSync(`${root}/fixture.db`,f);
 state.db=new PrismaClient({datasources:{db:{url:`file:${f}`}}});
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 state.failLedger=false;
 await state.db.globalSettings.create({data:{id:'default',deletePin:'424242',adminPin:'313131'}});
 await state.db.material.create({data:{id:'material',materialName:'Synthetic Rock',ratePerCft:20}});
});
afterEach(async()=>{vi.clearAllTimers();vi.useRealTimers();await state.db.$disconnect();});

const saleInput={saleDate:'2026-11-09',vehicleNumber:'ORIG 01',partyName:'Original Party',materialId:'material',qty:10,ratePerCft:20,discountType:'percentage' as const,discountValue:0,cashPaid:100,bankPaid:50,gPayPaid:20,bookNumber:'31',pageNumber:'1'};
const boulderInput={date:'2026-11-09',vehicleNumber:'ORIG 02',partyName:'Original Supplier',qty:10,rockRate:20,cashPaid:0,bankPaid:200,gPayPaid:0,vehicleRent:0,combinedPayment:false,time:'12:00',remarks:'Synthetic',bookNumber:'31',pageNumber:'3'} as any;

async function snapshot(db:any){return {parties:await db.party.count(),vehicles:await db.vehicle.count(),events:await db.financialEvent.count(),audit:await db.auditLog.count(),ledger:await db.partyLedger.count()};}

it('F08(a): wrong-PIN sale edit commits no master, financial, or audit rows and leaves the sale unchanged',async()=>{
 const created=await saveSale(saleInput);expect(created.success).toBe(true);
 const before=await snapshot(state.db);const beforeSale=await state.db.outgoingSale.findUnique({where:{id:created.data!.id}});
 const res=await saveSale({...saleInput,id:created.data!.id,partyName:'Orphan Party',vehicleNumber:'ORPHAN 01',qty:12,quantityReason:'Synthetic edit attempt'},'wrong-synthetic-pin');
 expect(res.success).toBe(false);
 expect(await state.db.party.findFirst({where:{partyName:'Orphan Party'}})).toBeNull();
 expect(await state.db.vehicle.findUnique({where:{vehicleNumber:'ORPHAN 01'}})).toBeNull();
 expect(await snapshot(state.db)).toEqual(before);
 expect(await state.db.outgoingSale.findUnique({where:{id:created.data!.id}})).toEqual(beforeSale);
});

it('F08(a): wrong-PIN purchase edit commits no master or audit rows and leaves the boulder unchanged',async()=>{
 const created=await saveIncomingBoulder(boulderInput);expect((created as any).id||(created as any).success).toBeTruthy();
 const row=await state.db.incomingBoulder.findFirst();
 const before=await snapshot(state.db);
 const res=await saveIncomingBoulder({...boulderInput,id:row.id,partyName:'Orphan Supplier',vehicleNumber:'ORPHAN 02'} as any,'wrong-synthetic-pin');
 expect((res as any).success??false).toBe(false);
 expect(await state.db.party.findFirst({where:{partyName:'Orphan Supplier'}})).toBeNull();
 expect(await state.db.vehicle.findUnique({where:{vehicleNumber:'ORPHAN 02'}})).toBeNull();
 expect(await snapshot(state.db)).toEqual(before);
 expect(await state.db.incomingBoulder.findUnique({where:{id:row.id}})).toEqual(row);
});

it('F08(a): sale create rolls master rows back when the transaction fails after the upserts',async()=>{
 state.failLedger=true;
 const res=await saveSale({...saleInput,partyName:'Fault Party',vehicleNumber:'FAULT 01'});
 expect(res.success).toBe(false);
 expect(await state.db.party.findFirst({where:{partyName:'Fault Party'}})).toBeNull();
 expect(await state.db.vehicle.findUnique({where:{vehicleNumber:'FAULT 01'}})).toBeNull();
 expect(await state.db.outgoingSale.count()).toBe(0);
 expect(await state.db.financialEvent.count()).toBe(0);
 expect(await state.db.auditLog.count()).toBe(0);
});

it('F08(a): purchase create rolls master rows back when the transaction fails after the upserts',async()=>{
 state.failLedger=true;
 const res=await saveIncomingBoulder({...boulderInput,partyName:'Fault Supplier',vehicleNumber:'FAULT 02'} as any);
 expect((res as any).success??false).toBe(false);
 expect(await state.db.party.findFirst({where:{partyName:'Fault Supplier'}})).toBeNull();
 expect(await state.db.vehicle.findUnique({where:{vehicleNumber:'FAULT 02'}})).toBeNull();
 expect(await state.db.incomingBoulder.count()).toBe(0);
 expect(await state.db.auditLog.count()).toBe(0);
});

it('F08(a): success semantics preserved - sale create links master rows; correct-PIN edit updates in place',async()=>{
 const created=await saveSale(saleInput);expect(created.success).toBe(true);
 const sale=created.data!;
 const party=await state.db.party.findFirst({where:{partyName:'Original Party'}});
 const vehicle=await state.db.vehicle.findUnique({where:{vehicleNumber:'ORIG 01'}});
 expect(sale.partyId).toBe(party.id);expect(sale.vehicleId).toBe(vehicle.id);
 expect(vehicle.tripCount).toBe(sale.tripDelta);
 const edited=await saveSale({...saleInput,id:sale.id,qty:12,quantityReason:'Synthetic measured correction'},'313131');
 expect(edited.success).toBe(true);expect(edited.data!.qty).toBe(12);
 expect(await state.db.party.count()).toBe(1);expect(await state.db.vehicle.count()).toBe(1);
 expect((await state.db.auditLog.findFirst({where:{entityId:sale.id,action:'update'}}))).not.toBeNull();
});

it('F08(a): success semantics preserved - purchase create/edit normal flows',async()=>{
 const created=await saveIncomingBoulder(boulderInput);expect((created as any).id).toBeTruthy();
 const row=await state.db.incomingBoulder.findFirst();
 expect((await state.db.party.findFirst({where:{partyName:'Original Supplier'}})).id).toBe(row.partyId);
 const edited=await saveIncomingBoulder({...boulderInput,id:row.id,qty:14} as any,'313131');
 expect((edited as any).qty).toBe(14);
 expect(await state.db.party.count()).toBe(1);expect(await state.db.vehicle.count()).toBe(1);
});

// AST contract (not a browser test): the documented safeguard is structural -
// master upserts must run inside the business transaction, and the edit PIN must
// be verified before any committed write.
it('F08(a) AST contract: master upserts are inside runTx and edit PIN is verified before the transaction',()=>{
 for(const [file,fn] of [['src/app/actions/sales.ts','saveSale'],['src/app/actions/purchases.ts','saveIncomingBoulder']] as const){
  const text=readFileSync(file,'utf8');
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  let target:ts.FunctionDeclaration|undefined;
  function findFn(node:ts.Node){if(ts.isFunctionDeclaration(node)&&node.name?.text===fn)target=node;ts.forEachChild(node,findFn);}findFn(source);
  expect(target,`${fn} found`).toBeTruthy();
  const upsertCalls:ts.CallExpression[]=[];const txCallbacks:ts.Node[]=[];let pinPos=-1;let txPos=-1;
  function visit(node:ts.Node,insideTx:boolean){
   if(ts.isCallExpression(node)){
    if(ts.isIdentifier(node.expression)){
     if(node.expression.text==='upsertPartyByName'||node.expression.text==='upsertVehicleByNumber'){(upsertCalls as any).push({node,insideTx});}
     if(node.expression.text==='verifyEditPassword'&&pinPos<0)pinPos=node.getStart();
     if(node.expression.text==='runTx'&&txPos<0)txPos=node.getStart();
    }
   }
   if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='runTx'){
    const cb=node.arguments.find(ts.isArrowFunction)||node.arguments.find(ts.isFunctionExpression);
    if(cb){ts.forEachChild(cb,(c)=>visit(c,true));return;}
   }
   ts.forEachChild(node,(c)=>visit(c,insideTx));
  }
  ts.forEachChild(target!,(c)=>visit(c,false));
  expect(upsertCalls.length,`${fn} has master upsert calls`).toBeGreaterThanOrEqual(2);
  for(const c of upsertCalls as any[])expect(c.insideTx,`${fn} upsert inside runTx`).toBe(true);
  expect(pinPos,`${fn} verifies edit PIN`).toBeGreaterThanOrEqual(0);
  expect(txPos,`${fn} has runTx`).toBeGreaterThanOrEqual(0);
  expect(pinPos<txPos,`${fn} verifies edit PIN before the transaction`).toBe(true);
 }
});
