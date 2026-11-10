import {vi,it,expect,beforeAll,afterAll} from 'vitest';import {PrismaClient} from '@prisma/client';import {copyFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null as any,online:false,deny:false,calls:[] as any[]}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));vi.mock('next/cache',()=>({revalidatePath:()=>{}}));vi.mock('@/lib/sync/connectivity',()=>({checkOnlineStatus:async()=>state.online}));
vi.mock('@/lib/supabase/client-sync',()=>({createSyncClient:()=>({from:(table:string)=>({upsert:async(row:any)=>{if(state.deny)return {error:{message:'Synthetic outage'}};state.calls.push({table,id:row.id});return {error:null};},select:()=>{const q:any={eq:()=>q,gt:()=>q,order:async()=>({data:[],error:null})};return q;}})})}));
import {deliverPendingOnPoll} from '../../src/lib/sync/reconnect-delivery';import {triggerSync} from '../../src/app/actions/sync';import {getSyncStatus} from '../../src/lib/sync/sync-service';
beforeAll(()=>{if(!process.env.MBM_TEST_ROOT)throw Error('isolated runner required');const file=`${process.env.MBM_TEST_ROOT}/reconnect.db`;copyFileSync(`${process.env.MBM_TEST_ROOT}/fixture.db`,file);state.db=new PrismaClient({datasources:{db:{url:`file:${file}`}}});});afterAll(async()=>state.db.$disconnect());
it('offline local save converges through actual triggerSync on later online polls, fault retry then idle no replay',async()=>{
 await state.db.material.create({data:{id:'offline-material',materialName:'Synthetic reconnect',ratePerCft:3}});const busy={current:false};
 expect(await deliverPendingOnPoll(await getSyncStatus(),state.online,busy,triggerSync)).toBe(false);expect(state.calls).toEqual([]);
 state.online=true;state.deny=true;await deliverPendingOnPoll(await getSyncStatus(),state.online,busy,triggerSync);expect((await getSyncStatus()).status).toBe('ERROR');expect((await getSyncStatus()).pendingCount).toBeGreaterThan(0);
 state.deny=false;await deliverPendingOnPoll(await getSyncStatus(),state.online,busy,triggerSync);expect(state.calls).toEqual([{table:'materials',id:'offline-material'}]);expect((await getSyncStatus()).pendingCount).toBe(0);
 await deliverPendingOnPoll(await getSyncStatus(),state.online,busy,triggerSync);expect(state.calls).toHaveLength(1);
});
