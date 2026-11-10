import {vi,it,expect,beforeAll,afterAll} from 'vitest';import {PrismaClient} from '@prisma/client';import {copyFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null as any,failRead:true,calls:[] as any[]}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>new Proxy(state.db,{get:(target,key)=>key==='auditLog'&&state.failRead?{findMany:async()=>{throw Error('QA synthetic audit read failed');}}:Reflect.get(target,key)})}));
vi.mock('@/lib/supabase/client-sync',()=>({createSyncClient:()=>({from:(table:string)=>({delete:()=>({lt:async()=>({error:null}),eq:async(_key:string,id:string)=>{state.calls.push({table,id,op:'delete'});return {error:null};}}),upsert:async(row:any)=>{state.calls.push({table,id:row.id,op:'upsert'});return {error:null};}})})}));
import {pushSync,getSyncStatus} from '@/lib/sync/sync-service';
beforeAll(()=>{if(!process.env.MBM_TEST_ROOT)throw Error('isolated runner required');const file=`${process.env.MBM_TEST_ROOT}/qa-audit-read.db`;copyFileSync(`${process.env.MBM_TEST_ROOT}/fixture.db`,file);state.db=new PrismaClient({datasources:{db:{url:`file:${file}`}}});});afterAll(async()=>state.db.$disconnect());
it('audit read failure retains cursor and retries older deletion after recovery',async()=>{
 await state.db.auditLog.create({data:{id:'qa-delete-old',entityName:'Vehicle',entityId:'qa-gone-vehicle',action:'delete',payload:'{}',createdAt:new Date('2026-11-09T10:00:00Z')}});
 await state.db.material.create({data:{id:'qa-healthy',materialName:'QA healthy later',ratePerCft:1,createdAt:new Date('2026-11-09T12:00:00Z'),updatedAt:new Date('2026-11-09T12:00:00Z')}});
 const first=await pushSync();expect(first.status).toBe('PARTIAL_SUCCESS');const firstCursor=await state.db.syncState.findUniqueOrThrow({where:{id:'default'}});expect(firstCursor.lastSyncedAt.getTime()).toBe(0);expect(state.calls).toContainEqual({table:'materials',id:'qa-healthy',op:'upsert'});
 state.failRead=false;state.calls=[];const second=await pushSync();expect(second.status).toBe('IDLE');expect(state.calls.filter(x=>x.op==='delete')).toContainEqual({table:'vehicles',id:'qa-gone-vehicle',op:'delete'});expect(state.calls.filter(x=>x.table==='audit_logs')).toContainEqual({table:'audit_logs',id:'qa-delete-old',op:'upsert'});expect((await getSyncStatus()).pendingCount).toBe(0);
});
