import {vi,it,expect,beforeAll,afterAll} from 'vitest';import {PrismaClient} from '@prisma/client';import {copyFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null as any,failRead:true,calls:[] as any[]}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>new Proxy(state.db,{get:(target,key)=>key==='material'&&state.failRead?{findMany:async()=>{throw Error('Synthetic local read failed');}}:Reflect.get(target,key)})}));
vi.mock('@/lib/supabase/client-sync',()=>({createSyncClient:()=>({from:(table:string)=>({delete:()=>({lt:async()=>({error:null})}),upsert:async(row:any)=>{state.calls.push({table,id:row.id});return {error:null};}})})}));
import {pushSync} from '@/lib/sync/sync-service';
beforeAll(()=>{if(!process.env.MBM_TEST_ROOT)throw Error('isolated runner required');const file=`${process.env.MBM_TEST_ROOT}/fetch.db`;copyFileSync(`${process.env.MBM_TEST_ROOT}/fixture.db`,file);state.db=new PrismaClient({datasources:{db:{url:`file:${file}`}}});});afterAll(async()=>state.db.$disconnect());
it('unknown-age failed model read retains watermark while healthy rows push and recovery delivers older row',async()=>{
 await state.db.material.create({data:{id:'old-material',materialName:'Old synthetic',ratePerCft:1,createdAt:new Date('2026-11-09T10:00:00Z'),updatedAt:new Date('2026-11-09T10:00:00Z')}});
 await state.db.vehicle.create({data:{id:'new-vehicle',vehicleNumber:'TEST-PUSH',createdAt:new Date('2026-11-09T12:00:00Z'),updatedAt:new Date('2026-11-09T12:00:00Z')}});
 const first=await pushSync();expect(first.status).toBe('PARTIAL_SUCCESS');expect(state.calls).toContainEqual({table:'vehicles',id:'new-vehicle'});expect((await state.db.syncState.findUniqueOrThrow({where:{id:'default'}})).lastSyncedAt.getTime()).toBe(0);
 state.failRead=false;state.calls=[];const second=await pushSync();expect(second.status).toBe('IDLE');expect(state.calls).toContainEqual({table:'materials',id:'old-material'});expect((await state.db.syncState.findUniqueOrThrow({where:{id:'default'}})).lastSyncedAt.toISOString()).toBe('2026-11-09T12:00:00.000Z');
});
