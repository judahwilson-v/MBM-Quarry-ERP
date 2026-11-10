import {vi,it,expect,beforeAll,afterAll} from 'vitest';import {PrismaClient} from '@prisma/client';import {copyFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null as any,remote:{} as Record<string,any[]>,ageDeletes:[] as any[],targetDeletes:[] as any[],deny:false,clients:0}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));vi.mock('next/cache',()=>({revalidatePath:()=>{}}));
vi.mock('@/lib/supabase/client-sync',()=>({createSyncClient:()=>{state.clients++;return {from:(table:string)=>({
 delete:()=>({lt:async(c:string,v:string)=>{state.ageDeletes.push({table,c,v});state.remote[table]=(state.remote[table]||[]).filter(r=>r[c]>=v);return {error:null};},eq:async(c:string,v:string)=>{state.targetDeletes.push({table,c,v});state.remote[table]=(state.remote[table]||[]).filter(r=>r[c]!==v);return {error:null};}}),
 upsert:async(row:any)=>{if(state.deny&&table==='audit_logs')return {error:{message:'Synthetic marker outage'}};const rows=state.remote[table]||[];state.remote[table]=[...rows.filter(r=>r.id!==row.id),row];return {error:null};},
 select:()=>{let column='';let cursor='';let action='';const q:any={eq:(c:string,v:string)=>{action=v;return q;},gt:(c:string,v:string)=>{column=c;cursor=v;return q;},order:async()=>({data:(state.remote[table]||[]).filter(r=>(!column||r[column]>cursor)&&(!action||r.action===action)),error:null})};return q;}
})};}}));
import {pushSync,pullSync,purgeOldSupabaseData} from '@/lib/sync/sync-service';import {purgeOldAuditLogs} from '@/lib/daybook-actions';import {triggerSupabaseDataPurge} from '@/app/actions/admin';
let a:any,b:any;
beforeAll(()=>{if(!process.env.MBM_TEST_ROOT)throw Error('isolated runner required');for(const id of ['a','b'])copyFileSync(`${process.env.MBM_TEST_ROOT}/fixture.db`,`${process.env.MBM_TEST_ROOT}/${id}.db`);a=new PrismaClient({datasources:{db:{url:`file:${process.env.MBM_TEST_ROOT}/a.db`}}});b=new PrismaClient({datasources:{db:{url:`file:${process.env.MBM_TEST_ROOT}/b.db`}}});state.db=a;});afterAll(async()=>{await a.$disconnect();await b.$disconnect();});
it('manual cloud/local cleanup fails closed and preserves an unacknowledged old deletion without provider access',async()=>{
 await a.auditLog.create({data:{id:'old-marker',entityName:'Vehicle',entityId:'deleted-vehicle',action:'delete',payload:'{}',createdAt:new Date('2026-01-01T10:00:00Z')}});
 const before=state.clients;expect((await purgeOldSupabaseData()).success).toBe(false);expect((await triggerSupabaseDataPurge()).success).toBe(false);expect((await purgeOldAuditLogs()).success).toBe(false);expect(state.clients).toBe(before);expect(await a.auditLog.count()).toBe(1);expect(state.ageDeletes).toEqual([]);
});
it('old facts and tombstones survive ordinary sync and a later reconnecting second client applies targeted deletion',async()=>{
 await a.financialEvent.create({data:{id:'old-fact',eventId:'old-event',correlationId:'synthetic',eventType:'SYNTHETIC',entityType:'Synthetic',entityId:'test',payload:{synthetic:true},createdAt:new Date('2026-01-01T09:00:00Z')}});
 await b.vehicle.create({data:{id:'deleted-vehicle',vehicleNumber:'TEST-OFFLINE',createdAt:new Date('2025-12-01T00:00:00Z'),updatedAt:new Date('2025-12-01T00:00:00Z')}});
 const result=await pushSync();expect(result.status).toBe('IDLE');await new Promise(r=>setTimeout(r,0));expect(state.remote.audit_logs).toHaveLength(1);expect(state.remote.financial_events).toHaveLength(1);expect(state.ageDeletes).toEqual([]);expect(state.targetDeletes).toContainEqual({table:'vehicles',c:'id',v:'deleted-vehicle'});
 // Client B was disconnected while A delivered. Its later pull still has history.
 state.db=b;expect((await pullSync()).status).toBe('IDLE');expect(await b.vehicle.count()).toBe(0);expect(await b.financialEvent.count()).toBe(1);state.db=a;
});
it('partial and error push attempts never perform age-only cleanup while real failure stays retryable',async()=>{
 await a.auditLog.create({data:{id:'blocked-marker',entityName:'Vehicle',entityId:'blocked-vehicle',action:'delete',payload:'{}',createdAt:new Date('2026-02-01T10:00:00Z')}});
 await a.material.create({data:{id:'healthy',materialName:'Synthetic F05',ratePerCft:1,updatedAt:new Date('2026-02-01T12:00:00Z')}});state.deny=true;expect((await pushSync()).status).toBe('PARTIAL_SUCCESS');
 // Remove healthy record only from synthetic fixture to exercise ERROR-only branch.
 await a.material.deleteMany();expect((await pushSync()).status).toBe('ERROR');await new Promise(r=>setTimeout(r,0));expect(state.ageDeletes).toEqual([]);expect(await a.auditLog.count()).toBe(2);state.deny=false;expect((await pushSync()).status).toBe('IDLE');
});
