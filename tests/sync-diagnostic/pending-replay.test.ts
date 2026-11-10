import {vi,it,expect,beforeAll,afterAll} from 'vitest';import {PrismaClient} from '@prisma/client';import {copyFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null as any,calls:[] as any[]}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));
vi.mock('@/lib/supabase/client-sync',()=>({createSyncClient:()=>({from:(table:string)=>({delete:()=>({lt:async()=>({error:null}),eq:async()=>({error:null})}),upsert:async(row:any)=>{state.calls.push({table,id:row.id});return {error:null};}})})}));
import {pushSync,getSyncStatus} from '@/lib/sync/sync-service';import {getDetailedSyncHealth} from '@/lib/sync/sync-health';import {setDeliveryMode,resetDeliveryModes} from '@/lib/sync/delivery-gate';
beforeAll(()=>{if(!process.env.MBM_TEST_ROOT)throw Error('isolated runner required');const file=`${process.env.MBM_TEST_ROOT}/mixed-date.db`;copyFileSync(`${process.env.MBM_TEST_ROOT}/fixture.db`,file);state.db=new PrismaClient({datasources:{db:{url:`file:${file}`}}});});afterAll(async()=>{resetDeliveryModes();await state.db.$disconnect();});
it('real SQLite TEXT seed timestamps and integer writes deliver once, with parked outbox preserved and separate',async()=>{
 await state.db.$executeRawUnsafe(`INSERT INTO materials (id,material_name,rate_per_cft,created_at,updated_at) VALUES ('text-seed','Synthetic seed',1,'2026-11-09 10:00:00','2026-11-09 10:00:00')`);
 await state.db.material.create({data:{id:'integer-row',materialName:'Synthetic integer',ratePerCft:2,createdAt:new Date('2026-11-09T12:00:00Z'),updatedAt:new Date('2026-11-09T12:00:00Z')}});
 await state.db.syncOutboxEvent.create({data:{id:'parked',eventId:'parked-event',deviceId:'synthetic-device',entityType:'Material',entityId:'integer-row',operation:'CREATE',payload:'{}'}});
 const types=await state.db.$queryRawUnsafe(`SELECT typeof(updated_at) AS storage FROM materials ORDER BY id`);expect(types).toEqual([{storage:'integer'},{storage:'text'}]);
 const first=await pushSync();expect(first.status).toBe('IDLE');expect(state.calls).toContainEqual({table:'materials',id:'text-seed'});expect(state.calls).toContainEqual({table:'materials',id:'integer-row'});
 const status=await getSyncStatus();expect(status.pendingCount).toBe(0);expect(status.parkedOutboxCount).toBe(1);
 const health=await getDetailedSyncHealth(state.db);expect(health.overall.totalPending).toBe(0);expect(health.overall.parkedOutboxCount).toBe(1);expect(health.outbox.pending).toBe(1);expect(health.models.find(x=>x.name==='Material')?.status).toBe('synced');
 state.calls=[];await pushSync();expect(state.calls).toEqual([]);expect((await state.db.syncOutboxEvent.findUniqueOrThrow({where:{id:'parked'}})).status).toBe('PENDING');
 // A later real write must still become pending and deliver, without re-sending old TEXT seed.
 await state.db.material.update({where:{id:'integer-row'},data:{ratePerCft:3,updatedAt:new Date('2026-11-09T13:00:00Z')}});
 expect((await getSyncStatus()).pendingCount).toBe(1);await pushSync();expect(state.calls).toEqual([{table:'materials',id:'integer-row'}]);expect((await getSyncStatus()).pendingCount).toBe(0);
});
it('outbox-mode and unknown entities remain active, shadow remains parked, with no status mutation',async()=>{
 setDeliveryMode('Material','outbox');expect((await getSyncStatus()).pendingCount).toBe(1);expect((await getDetailedSyncHealth(state.db)).overall.totalPendingOutbox).toBe(1);
 setDeliveryMode('Material','shadow');expect((await getSyncStatus()).pendingCount).toBe(0);expect((await getSyncStatus()).parkedOutboxCount).toBe(1);
 await state.db.syncOutboxEvent.create({data:{id:'unknown',eventId:'unknown-event',deviceId:'synthetic-device',entityType:'UnknownEntity',entityId:'unknown',operation:'CREATE',payload:'{}'}});
 expect((await getSyncStatus()).pendingCount).toBe(1);expect((await getDetailedSyncHealth(state.db)).overall.totalPendingOutbox).toBe(1);expect(await state.db.syncOutboxEvent.count({where:{status:'PENDING'}})).toBe(2);resetDeliveryModes();
});
