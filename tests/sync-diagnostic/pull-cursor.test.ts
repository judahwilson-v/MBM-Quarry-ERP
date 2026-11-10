import {vi,it,expect,beforeAll,afterAll} from 'vitest';
import {PrismaClient} from '@prisma/client';import {copyFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null as any,failMaterials:true,rows:{materials:[{id:'remote-material',material_name:'Synthetic Material',rate_per_cft:40,created_at:'2026-11-09T10:00:00.000Z',updated_at:'2026-11-09T10:00:00.000Z'}],vehicles:[{id:'remote-vehicle',vehicle_number:'TEST-REMOTE',trip_count:0,created_at:'2026-11-09T12:00:00.000Z',updated_at:'2026-11-09T12:00:00.000Z'}]} as Record<string,any[]>}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));
vi.mock('@/lib/supabase/client-sync',()=>({createSyncClient:()=>({from:(table:string)=>({select:()=>{let column='';let cursor='';const query:any={eq:()=>query,gt:(c:string,v:string)=>{column=c;cursor=v;return query;},order:async()=>{if(table==='materials'&&state.failMaterials)return {data:null,error:{message:'Synthetic transient fetch failure'}};return {data:(state.rows[table]||[]).filter(r=>r[column]>cursor),error:null};}};return query;}})})}));
import {pullSync} from '@/lib/sync/sync-service';
beforeAll(()=>{if(!process.env.MBM_TEST_ROOT)throw Error('isolated runner required');const file=`${process.env.MBM_TEST_ROOT}/pull.db`;copyFileSync(`${process.env.MBM_TEST_ROOT}/fixture.db`,file);state.db=new PrismaClient({datasources:{db:{url:`file:${file}`}}});});
afterAll(async()=>state.db.$disconnect());
it('failed table keeps shared pull cursor and converges after recovery',async()=>{
 const first=await pullSync();expect(first.status).toBe('PARTIAL_SUCCESS');expect(first.errors).toContainEqual(expect.objectContaining({table:'materials'}));
 expect(await state.db.vehicle.count()).toBe(1);expect(await state.db.material.count()).toBe(0);
 expect((await state.db.syncState.findUniqueOrThrow({where:{id:'pull_state'}})).lastSyncedAt.toISOString()).toBe('1970-01-01T00:00:00.000Z');
 state.failMaterials=false;const second=await pullSync();expect(second.status).toBe('IDLE');expect(second.errors).toEqual([]);expect(await state.db.material.count()).toBe(1);expect(await state.db.vehicle.count()).toBe(1);
 
});
it('failed local FK row keeps cursor while healthy row persists and retries after its parent arrives',async()=>{
 state.failMaterials=false;await state.db.vehicle.deleteMany();await state.db.material.deleteMany();await state.db.syncState.deleteMany();
 state.rows={vehicles:[{id:'fk-vehicle',vehicle_number:'TEST-FK',party_id:'late-parent',trip_count:0,created_at:'2026-11-09T10:00:00.000Z',updated_at:'2026-11-09T10:00:00.000Z'}],materials:[{id:'healthy-material',material_name:'Healthy',rate_per_cft:1,created_at:'2026-11-09T12:00:00.000Z',updated_at:'2026-11-09T12:00:00.000Z'}]};
 const first=await pullSync();expect(first.status).toBe('PARTIAL_SUCCESS');expect(first.errors).toContainEqual(expect.objectContaining({rowId:'fk-vehicle'}));expect(await state.db.material.count()).toBe(1);expect(await state.db.vehicle.count()).toBe(0);
 expect((await state.db.syncState.findUniqueOrThrow({where:{id:'pull_state'}})).lastSyncedAt.getTime()).toBe(0);
 state.rows.parties=[{id:'late-parent',party_name:'Synthetic Parent',created_at:'2026-11-09T09:00:00.000Z',updated_at:'2026-11-09T09:00:00.000Z'}];
 const recovered=await pullSync();expect(recovered.status).toBe('IDLE');expect(await state.db.vehicle.count()).toBe(1);expect(await state.db.material.count()).toBe(1);
 expect((await state.db.syncState.findUniqueOrThrow({where:{id:'pull_state'}})).lastSyncedAt.toISOString()).toBe('2026-11-09T12:00:00.000Z');
});
