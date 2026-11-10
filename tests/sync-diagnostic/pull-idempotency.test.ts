import {vi,it,expect,beforeAll,afterAll} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {copyFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null as any,failMaterials:false,rows:{vehicles:[{id:'remote-vehicle-1',vehicle_number:'IDEMP 01',trip_count:0,created_at:'2026-11-09T10:00:00.000Z',updated_at:'2026-11-09T10:00:00.000Z'}],materials:[{id:'remote-material-1',material_name:'Idem Material',rate_per_cft:40,created_at:'2026-11-09T10:00:00.000Z',updated_at:'2026-11-09T10:00:00.000Z'}]} as Record<string,any[]>}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));
vi.mock('@/lib/supabase/client-sync',()=>({createSyncClient:()=>({from:(table:string)=>({select:()=>{let column='';let cursor='';const query:any={eq:()=>query,gt:(c:string,v:string)=>{column=c;cursor=v;return query;},order:async()=>{if(table==='materials'&&state.failMaterials)return {data:null,error:{message:'Synthetic transient fetch failure'}};return {data:(state.rows[table]||[]).filter(r=>r[column]>cursor),error:null};}};return query;}})})}));
import {pullSync} from '@/lib/sync/sync-service';
beforeAll(()=>{if(!process.env.MBM_TEST_ROOT)throw Error('isolated runner required');const file=`${process.env.MBM_TEST_ROOT}/pull-idem.db`;copyFileSync(`${process.env.MBM_TEST_ROOT}/fixture.db`,file);state.db=new PrismaClient({datasources:{db:{url:`file:${file}`}}});});
afterAll(async()=>state.db.$disconnect());

// T15/T16 characterization: pull applies remote rows by id-keyed upsert, so a
// redelivery after a cursor regression (restore, interrupted run) must not
// duplicate rows or re-apply effects. Pins existing behavior; not a guarantee
// about live remote-side dedupe, which is fake-remote bounded.
it('redelivered remote rows apply idempotently after a cursor regression',async()=>{
 const first=await pullSync();
 expect(first.status).toBe('IDLE');
 expect(await state.db.vehicle.count()).toBe(1);
 expect(await state.db.material.count()).toBe(1);
 await state.db.syncState.update({where:{id:'pull_state'},data:{lastSyncedAt:new Date(0)}});
 const second=await pullSync();
 expect(second.status).toBe('IDLE');
 expect(await state.db.vehicle.count()).toBe(1);
 expect(await state.db.material.count()).toBe(1);
 const v=await state.db.vehicle.findUniqueOrThrow({where:{id:'remote-vehicle-1'}});
 expect(v.vehicleNumber).toBe('IDEMP 01');
 expect(v.tripCount).toBe(0);
 const m=await state.db.material.findUniqueOrThrow({where:{id:'remote-material-1'}});
 expect(m.ratePerCft).toBe(40);
});
