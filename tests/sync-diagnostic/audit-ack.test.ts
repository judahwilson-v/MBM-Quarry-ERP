import {vi,it,expect,beforeAll,afterAll} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {copyFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null as any,calls:[] as any[],auditBlocked:true}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));
vi.mock('@/lib/supabase/client-sync',()=>({createSyncClient:()=>({from:(table:string)=>({
 delete:()=>({lt:async()=>({error:null}),eq:async(_key:string,id:string)=>{state.calls.push({table,id,op:'delete'});return {error:null};}}),
 upsert:async(row:any)=>{state.calls.push({table,id:row.id,op:'upsert'});return {error:table==='audit_logs'&&state.auditBlocked?{code:'42501',message:'Synthetic audit denied'}:null};}
})})}));
import {pushSync,getSyncStatus} from '@/lib/sync/sync-service';
beforeAll(()=>{if(!process.env.MBM_TEST_ROOT)throw Error('isolated runner required');const file=`${process.env.MBM_TEST_ROOT}/ack.db`;copyFileSync(`${process.env.MBM_TEST_ROOT}/fixture.db`,file);state.db=new PrismaClient({datasources:{db:{url:`file:${file}`}}});});
afterAll(async()=>state.db.$disconnect());
it('failed tombstone acknowledgement stays pending until retry succeeds',async()=>{
 await state.db.auditLog.create({data:{id:'synthetic-delete',entityName:'Vehicle',entityId:'synthetic-vehicle',action:'delete',payload:'{}',createdAt:new Date('2026-11-09T10:00:00Z')}});
 const first=await pushSync();
 expect(first.status).toBe('ERROR');expect(first.errors[0].error).toContain('Audit acknowledgement failed');
 expect((await getSyncStatus()).pendingCount).toBeGreaterThan(0);
 const cursor=await state.db.syncState.findUniqueOrThrow({where:{id:'default'}});
 expect(cursor.lastSyncedAt.getTime()).toBeLessThan(new Date('2026-11-09T10:00:00Z').getTime());
 state.auditBlocked=false;state.calls=[];
 const second=await pushSync();expect(second.status).toBe('IDLE');
 expect(state.calls.filter(x=>x.table==='audit_logs')).toHaveLength(1);expect((await getSyncStatus()).pendingCount).toBe(0);
 
});
