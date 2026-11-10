import {vi,it,expect,beforeAll,afterAll} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {copyFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null as any,blocked:true,calls:[] as any[]}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));
vi.mock('@/lib/supabase/client-sync',()=>({createSyncClient:()=>({from:(table:string)=>({
 delete:()=>({lt:async()=>({error:null}),eq:async(_key:string,id:string)=>{state.calls.push({table,id,op:'delete'});return {error:state.blocked?{code:'23503',message:'Synthetic FK dependency'}:null};}}),
 upsert:async(row:any)=>{state.calls.push({table,id:row.id,op:'upsert'});return {error:null};}
})})}));
import {pushSync,getSyncStatus} from '@/lib/sync/sync-service';
beforeAll(()=>{if(!process.env.MBM_TEST_ROOT)throw Error('isolated runner required');const file=`${process.env.MBM_TEST_ROOT}/sync-${process.pid}.db`;copyFileSync(`${process.env.MBM_TEST_ROOT}/fixture.db`,file);state.db=new PrismaClient({datasources:{db:{url:`file:${file}`}}});});
afterAll(async()=>state.db.$disconnect());
it('held deletion remains visible and retries next sync after parent dependency clears',async()=>{
 await state.db.auditLog.create({data:{id:'synthetic-delete',entityName:'Vehicle',entityId:'synthetic-old-vehicle',action:'delete',payload:JSON.stringify({before:{id:'synthetic-old-vehicle'}}),createdAt:new Date('2026-11-09T10:00:00Z')}});
 const first=await pushSync();expect(first.skipped).toBe(1);
 expect(first.status).not.toBe('IDLE');
 const visible=await getSyncStatus();expect(visible.status).toBe('ERROR');expect(visible.pendingCount).toBeGreaterThan(0);expect(visible.lastError).toContain('remains pending');
 const cursor=await state.db.syncState.findUniqueOrThrow({where:{id:'default'}});
 expect(cursor.lastSyncedAt.getTime()).toBeLessThan(new Date('2026-11-09T10:00:00Z').getTime());
 const prior=state.calls.length;state.blocked=false;
 const second=await pushSync();expect(second.status).toBe('IDLE');expect(second.skipped).toBe(0);
 expect(state.calls.slice(prior)).toContainEqual({table:'vehicles',id:'synthetic-old-vehicle',op:'delete'});
 expect(await state.db.auditLog.count()).toBe(1);
 const finalCursor=await state.db.syncState.findUniqueOrThrow({where:{id:'default'}});
 expect(finalCursor.lastSyncedAt.toISOString()).toBe('2026-11-09T10:00:00.000Z');
});

it('healthy rows can proceed while a failed delete stays retryable',async()=>{
 state.blocked=true;state.calls=[];
 await state.db.auditLog.create({data:{id:'synthetic-delete-2',entityName:'Vehicle',entityId:'synthetic-old-vehicle-2',action:'delete',payload:'{}',createdAt:new Date('2026-11-09T11:00:00Z')}});
 await state.db.material.create({data:{id:'synthetic-material',materialName:'Synthetic only',ratePerCft:40,createdAt:new Date('2026-11-09T12:00:00Z'),updatedAt:new Date('2026-11-09T12:00:00Z')}});
 const result=await pushSync();expect(result.status).toBe('PARTIAL_SUCCESS');expect(result.errors).toContainEqual(expect.objectContaining({rowId:'synthetic-old-vehicle-2'}));
 expect(state.calls).toContainEqual({table:'materials',id:'synthetic-material',op:'upsert'});
 expect((await state.db.syncState.findUniqueOrThrow({where:{id:'default'}})).lastSyncedAt.getTime()).toBeLessThan(new Date('2026-11-09T11:00:00Z').getTime());
 state.blocked=false;await pushSync();
 expect((await state.db.syncState.findUniqueOrThrow({where:{id:'default'}})).lastSyncedAt.toISOString()).toBe('2026-11-09T12:00:00.000Z');
});
