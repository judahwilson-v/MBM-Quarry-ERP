import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {copyFileSync,readFileSync} from 'node:fs';
import ts from 'typescript';
const state=vi.hoisted(()=>({db:null as any,failOutbox:false}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));
vi.mock('@/lib/sync/auto-sync',()=>({triggerAutoSync:vi.fn()}));
// Auth is intentionally NOT mocked: deleteVehicle's real verifyEditPassword runs
// against the synthetic GlobalSettings row so wrong-PIN refusal exercises the
// production check. Fault injection: enqueueOutboxEvent runs INSIDE saveVehicle's
// vehicle transaction, so forcing it to fail proves whether the party upsert that
// precedes the transaction commits anyway (the F08 same-class risk shape).
vi.mock('@/lib/sync/outbox',async()=>{
 const actual=await vi.importActual<any>('@/lib/sync/outbox');
 return {...actual,enqueueOutboxEvent:async(...args:any[])=>{if(state.failOutbox)throw new Error('synthetic in-transaction fault');return actual.enqueueOutboxEvent(...args);}};
});
import {saveVehicle,deleteVehicle} from '../../src/app/actions/vehicles';

let n=0;
beforeEach(async()=>{
 const root=process.env.MBM_TEST_ROOT;if(!root)throw Error('isolated fixture required');
 const f=`${root}/f09-${++n}.db`;copyFileSync(`${root}/fixture.db`,f);
 state.db=new PrismaClient({datasources:{db:{url:`file:${f}`}}});
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 state.failOutbox=false;
 await state.db.globalSettings.create({data:{id:'default',deletePin:'424242',adminPin:'313131'}});
});
afterEach(async()=>{vi.clearAllTimers();vi.useRealTimers();await state.db.$disconnect();});

async function snapshot(db:any){return {parties:await db.party.count(),vehicles:await db.vehicle.count(),audit:await db.auditLog.count(),outbox:await db.syncOutboxEvent.count()};}

it('F09 characterization: wrong-PIN vehicle delete commits nothing and keeps the vehicle',async()=>{
 const created=await saveVehicle({vehicleNumber:'KEEP 01',partyName:null});
 const before=await snapshot(state.db);
 const res=await deleteVehicle(created.id,'wrong-synthetic-pin');
 expect(res.success).toBe(false);
 expect(await snapshot(state.db)).toEqual(before);
 expect(await state.db.vehicle.findUnique({where:{vehicleNumber:'KEEP 01'}})).not.toBeNull();
});

it('F09 acceptance: vehicle create with a new party rolls the party back when the transaction fails after the upsert',async()=>{
 state.failOutbox=true;
 await expect(saveVehicle({vehicleNumber:'FAULT 01',partyName:'Orphan Party'})).rejects.toThrow();
 expect(await state.db.party.findFirst({where:{partyName:'Orphan Party'}})).toBeNull();
 expect(await state.db.vehicle.count()).toBe(0);
 expect(await state.db.auditLog.count()).toBe(0);
});

it('F09 acceptance: vehicle edit switching to a new party rolls the party back on fault and keeps the stored row',async()=>{
 const created=await saveVehicle({vehicleNumber:'EDIT 01',partyName:null});
 const beforeRow=await state.db.vehicle.findUnique({where:{id:created.id}});
 const before=await snapshot(state.db);
 state.failOutbox=true;
 await expect(saveVehicle({id:created.id,vehicleNumber:'EDIT 01',partyName:'Edit Orphan',companyBodyQty:9})).rejects.toThrow();
 expect(await state.db.party.findFirst({where:{partyName:'Edit Orphan'}})).toBeNull();
 expect(await snapshot(state.db)).toEqual(before);
 expect(await state.db.vehicle.findUnique({where:{id:created.id}})).toEqual(beforeRow);
});

it('F09 acceptance: a real duplicate-number create fault leaves no orphan party behind',async()=>{
 await saveVehicle({vehicleNumber:'DUP 01',partyName:null});
 const before=await snapshot(state.db);
 await expect(saveVehicle({vehicleNumber:'dup 01',partyName:'Second Orphan'})).rejects.toThrow();
 expect(await state.db.party.findFirst({where:{partyName:'Second Orphan'}})).toBeNull();
 expect(await snapshot(state.db)).toEqual(before);
});

it('F09 success semantics preserved: create links party, edit updates in place, no duplicate masters',async()=>{
 const created=await saveVehicle({vehicleNumber:'GOOD 01',partyName:'Good Party',companyBodyQty:5});
 expect(created.id).toBeTruthy();
 const party=await state.db.party.findFirst({where:{partyName:'Good Party'}});
 expect(party).not.toBeNull();
 expect(await state.db.auditLog.findFirst({where:{entityName:'Vehicle',entityId:created.id,action:'create'}})).not.toBeNull();
 expect(await state.db.syncOutboxEvent.findFirst({where:{entityId:created.id,operation:'create'}})).not.toBeNull();
 const edited=await saveVehicle({id:created.id,vehicleNumber:'GOOD 01',partyName:'Good Party',companyBodyQty:7,vehicleType:'Synthetic Tipper'});
 expect(edited.companyBodyQty).toBe(7);expect(edited.vehicleType).toBe('Synthetic Tipper');
 expect(await state.db.party.count()).toBe(1);expect(await state.db.vehicle.count()).toBe(1);
 expect(await state.db.auditLog.findFirst({where:{entityName:'Vehicle',entityId:created.id,action:'update'}})).not.toBeNull();
});

it('F09 success semantics preserved: correct-PIN delete removes an unreferenced vehicle with audit and outbox rows',async()=>{
 const created=await saveVehicle({vehicleNumber:'DEL 01',partyName:null});
 const res=await deleteVehicle(created.id,'424242');
 expect(res.success).toBe(true);
 expect(await state.db.vehicle.findUnique({where:{id:created.id}})).toBeNull();
 expect(await state.db.auditLog.findFirst({where:{entityName:'Vehicle',entityId:created.id,action:'delete'}})).not.toBeNull();
 expect(await state.db.syncOutboxEvent.findFirst({where:{entityId:created.id,operation:'delete'}})).not.toBeNull();
});

// AST contract (not a browser test): the documented safeguard is structural -
// the party master upsert must run inside the same transaction as the vehicle
// write. saveVehicle has no PIN gate in the baseline UI or server contract, and
// this correction deliberately does not add one (server auth preserved as-is).
it('F09 characterization: correct-PIN delete refuses a vehicle referenced by a sale only, commits nothing, and keeps the sale linkage',async()=>{
 const created=await saveVehicle({vehicleNumber:'SALEREF 01',partyName:null});
 // The DB relation is onDelete:SetNull, so the application-level guard is the
 // only thing standing between a delete and a silently unlinked sale.
 await state.db.outgoingSale.create({data:{saleDate:new Date('2026-11-09T18:30:00.000Z'),vehicleId:created.id,vehicleNumber:'SALEREF 01',partyName:'Synthetic Party',materialName:'Synthetic Material',ratePerCft:20,qty:10,amount:200,finalAmount:200}});
 const before=await snapshot(state.db);
 const res=await deleteVehicle(created.id,'424242');
 expect(res.success).toBe(false);
 expect(res.error).toContain('1 sale(s)');
 expect(res.error).toContain('0 boulder purchase(s)');
 expect(res.error).toContain('0 fuel record(s)');
 expect(await state.db.vehicle.findUnique({where:{id:created.id}})).not.toBeNull();
 expect(await snapshot(state.db)).toEqual(before);
 expect((await state.db.outgoingSale.findFirst({where:{vehicleNumber:'SALEREF 01'}}))?.vehicleId).toBe(created.id);
});

it('F09 characterization: correct-PIN delete refuses a vehicle referenced by a fuel purchase only, commits nothing, and keeps the fuel linkage',async()=>{
 const created=await saveVehicle({vehicleNumber:'FUELREF 01',partyName:null});
 await state.db.fuelPurchase.create({data:{date:new Date('2026-11-09T18:30:00.000Z'),amount:500,sourceEventId:'synthetic-fuel-evt-refdelete-1',vehicleId:created.id,vehicleNumber:'FUELREF 01'}});
 const before=await snapshot(state.db);
 const res=await deleteVehicle(created.id,'424242');
 expect(res.success).toBe(false);
 expect(res.error).toContain('0 sale(s)');
 expect(res.error).toContain('0 boulder purchase(s)');
 expect(res.error).toContain('1 fuel record(s)');
 expect(await state.db.vehicle.findUnique({where:{id:created.id}})).not.toBeNull();
 expect(await snapshot(state.db)).toEqual(before);
 expect((await state.db.fuelPurchase.findFirst({where:{sourceEventId:'synthetic-fuel-evt-refdelete-1'}}))?.vehicleId).toBe(created.id);
});

it('F09 AST contract: the party upsert takes the transaction and is only called inside runTx',()=>{
 const file='src/app/actions/vehicles.ts';
 const text=readFileSync(file,'utf8');
 const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 let upsertFn:ts.FunctionDeclaration|undefined;let saveFn:ts.FunctionDeclaration|undefined;
 function findFn(node:ts.Node){
  if(ts.isFunctionDeclaration(node)&&node.name?.text==='upsertPartyByName')upsertFn=node;
  if(ts.isFunctionDeclaration(node)&&node.name?.text==='saveVehicle')saveFn=node;
  ts.forEachChild(node,findFn);
 }
 findFn(source);
 expect(upsertFn,'upsertPartyByName found').toBeTruthy();
 expect(saveFn,'saveVehicle found').toBeTruthy();
 const firstParam=upsertFn!.parameters[0];
 expect(firstParam?.type?.getText(),'upsert takes the transaction client').toContain('TransactionClient');
 const upsertCalls:{node:ts.Node,insideTx:boolean}[]=[];
 function visit(node:ts.Node,insideTx:boolean){
  if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)){
   if(node.expression.text==='upsertPartyByName')upsertCalls.push({node,insideTx});
   if(node.expression.text==='runTx'){
    const cb=node.arguments.find(ts.isArrowFunction)||node.arguments.find(ts.isFunctionExpression);
    if(cb){ts.forEachChild(cb,(c)=>visit(c,true));return;}
   }
  }
  ts.forEachChild(node,(c)=>visit(c,insideTx));
 }
 ts.forEachChild(saveFn!,(c)=>visit(c,false));
 expect(upsertCalls.length,'saveVehicle calls the party upsert').toBeGreaterThanOrEqual(1);
 for(const c of upsertCalls)expect(c.insideTx,'party upsert inside runTx').toBe(true);
});
