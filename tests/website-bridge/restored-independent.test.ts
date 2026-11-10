import { beforeAll, it, expect, vi } from 'vitest';
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { requestSaleRemarksEdit, decideChangeRequest } from '@/app/actions/change-requests';
import { processWebsiteDecisions, WEBSITE_MAPPING_PREFIX, type DecisionIntent, type DecisionReceipt, type DecisionTransport } from '@/lib/website/decision-bridge';
import { ENROLLMENT_KEY, CONTROL_PRINCIPAL_KEY, newSessionToken } from '@/lib/identity/service';
const db = new PrismaClient();
let worker: string, owner: string, uncle: string, wt: string, ot: string;
let material: string;
async function user(name: string) { return db.appUser.create({ data: { name, pinHash: randomUUID(), pinSalt: randomUUID(), role: 'worker' } }); }
async function session(id: string) { const token = newSessionToken(); await db.authSession.create({ data: { userId: id, token, expiresAt: new Date(Date.now()+3600000) } }); return token; }
async function meta(key:string,value:string) { await db.appMeta.upsert({where:{key},create:{key,value},update:{value}}); }
beforeAll(async () => {
 worker=(await user('Synthetic Worker')).id; owner=(await user('Synthetic Owner')).id; uncle=(await user('Synthetic Second Approver')).id;
 wt=await session(worker); ot=await session(owner);
 await meta(ENROLLMENT_KEY,'true'); await meta(CONTROL_PRINCIPAL_KEY,owner);
 await meta(WEBSITE_MAPPING_PREFIX+'cloud-owner',owner); await meta(WEBSITE_MAPPING_PREFIX+'cloud-second',uncle);
 material=(await db.material.create({data:{materialName:'Synthetic bridge material',ratePerCft:50}})).id;
});
async function req(requester=wt) {
 const sale=await db.outgoingSale.create({data:{saleDate:new Date('2026-01-05T00:00:00'),bookNumber:1,pageNumber:1,vehicleNumber:'ZZ SYNTHETIC 0101',partyName:'Synthetic Buyer',materialId:material,materialName:'Synthetic bridge material',ratePerCft:50,qty:10,amount:500,finalAmount:500,remarks:'before'}});
 const r=await requestSaleRemarksEdit({saleId:sale.id,proposedRemarks:'after',reason:'Synthetic correction',idempotencyKey:randomUUID()},requester);
 if (!r.success) throw new Error('Fixture request could not be filed');
 return {saleId:sale.id,requestId:r.request.id};
}
class Queue implements DecisionTransport {
 cloudActive=true;
 async issuerActive(_issuerUserId:string,_principalId:string){return this.cloudActive}
 sequenceById=new Map<string,number>();
 rows:DecisionIntent[]=[]; receipts:DecisionReceipt[]=[]; claims=new Map<string,string>(); failAck=false;
 add(requestId:string, issuerUserId='cloud-owner',approve=true) {const r={id:randomUUID(),requestId,issuerUserId,approve,note:null,createdAt:new Date().toISOString()};this.sequenceById.set(r.id,this.sequenceById.size);this.rows.push(r);return r;}
 async pending(){return this.rows.filter(r=>!this.receipts.some(a=>a.intentId===r.id)).sort((a,b)=>this.sequenceById.get(a.id)!-this.sequenceById.get(b.id)!);}
 async claim(id:string){if(this.claims.has(id))return null; const fence=randomUUID();this.claims.set(id,fence);return fence;}
 async acknowledge(id:string,fence:string,r:DecisionReceipt){if(this.claims.get(id)!==fence)throw new Error('Stale fence');if(this.failAck){this.failAck=false;throw new Error('Synthetic ACK outage');}this.receipts.push(r);}
 expireClaims(){this.claims.clear();}
}
it('distinct mapped private approvers apply through the same core without a local owner session',async()=>{
 for(const issuer of ['cloud-owner','cloud-second']){const r=await req();const q=new Queue();q.add(r.requestId,issuer);const out=await processWebsiteDecisions({db,transport:q});expect(out[0].status).toBe('APPLIED');const record=await db.changeRequest.findUniqueOrThrow({where:{id:r.requestId}});expect(record.decidedById).toBe(issuer==='cloud-owner'?owner:uncle);expect((await db.outgoingSale.findUniqueOrThrow({where:{id:r.saleId}})).remarks).toBe('after');}
});
it('an unmapped website account is refused even if its display name matches an approver',async()=>{
 const r=await req();const q=new Queue();q.add(r.requestId,'not-provisioned');expect((await processWebsiteDecisions({db,transport:q}))[0].status).toBe('REFUSED');expect((await db.changeRequest.findUniqueOrThrow({where:{id:r.requestId}})).status).toBe('PENDING');
});
it('self approval is refused by stable ID, not bypassed by website mapping',async()=>{
 const r=await req(ot);const q=new Queue();q.add(r.requestId);expect((await processWebsiteDecisions({db,transport:q}))[0].status).toBe('REFUSED');expect(q.receipts).toHaveLength(1);expect((await db.changeRequest.findUniqueOrThrow({where:{id:r.requestId}})).status).toBe('PENDING');
});
it('concurrent intent claims apply only once in the local stand-in',async()=>{
 const r=await req();const q=new Queue();q.add(r.requestId);const before=await db.auditLog.count({where:{entityName:'Sale',entityId:r.saleId}});await Promise.all([processWebsiteDecisions({db,transport:q}),processWebsiteDecisions({db,transport:q})]);expect(q.receipts).toHaveLength(1);expect(await db.auditLog.count({where:{entityName:'Sale',entityId:r.saleId}})).toBe(before+1);
});
it('ACK outage after local apply recovers by terminal replay, never a second sale mutation',async()=>{
 const r=await req();const q=new Queue();q.add(r.requestId);q.failAck=true;await expect(processWebsiteDecisions({db,transport:q})).rejects.toThrow('ACK outage');expect((await db.changeRequest.findUniqueOrThrow({where:{id:r.requestId}})).status).toBe('APPLIED');const count=await db.auditLog.count({where:{entityName:'Sale',entityId:r.saleId}});q.expireClaims();expect((await processWebsiteDecisions({db,transport:q}))[0].status).toBe('APPLIED');expect(await db.auditLog.count({where:{entityName:'Sale',entityId:r.saleId}})).toBe(count);
});
it('unknown request gets a truthful REFUSED receipt, never an invented apply',async()=>{
 const q=new Queue();q.add('unknown-synthetic-request');expect((await processWebsiteDecisions({db,transport:q}))[0].status).toBe('REFUSED');expect(q.receipts[0].message).toMatch(/no matching request/);
});
it('rejection is recorded as REJECTED and replay preserves that outcome',async()=>{
 const r=await req();const q=new Queue();q.add(r.requestId,'cloud-second',false);expect((await processWebsiteDecisions({db,transport:q}))[0].status).toBe('REJECTED');expect((await db.outgoingSale.findUniqueOrThrow({where:{id:r.saleId}})).remarks).toBe('before');
});
it('existing local worker remains unable to call the privileged local decision action',async()=>{
 const r=await req();expect((await decideChangeRequest(r.requestId,{approve:true},wt)).success).toBe(false);
});
it('offline queue read fails without touching local requests and resumes oldest first',async()=>{
 const r1=await req(),r2=await req();const q=new Queue();const a=q.add(r1.requestId),b=q.add(r2.requestId);a.createdAt='2026-01-01T00:00:00Z';b.createdAt='2026-01-02T00:00:00Z';q.rows.reverse();const original=q.pending.bind(q);q.pending=async()=>{throw new Error('Synthetic offline');};await expect(processWebsiteDecisions({db,transport:q})).rejects.toThrow('offline');expect((await db.changeRequest.findUniqueOrThrow({where:{id:r1.requestId}})).status).toBe('PENDING');q.pending=original;expect((await processWebsiteDecisions({db,transport:q})).map(r=>r.requestId)).toEqual([r1.requestId,r2.requestId]);
});

it('full local round trip mirrors pending, consumes website intent, mirrors actual decided state',async()=>{
 const {websiteApprovalRoundTrip}=await import('@/lib/website/round-trip');
 const r=await req();const q=new Queue();const snapshots:any[]=[];
 const transport=Object.assign(q,{mirror:async(rows:any[])=>{snapshots.push(rows);}});
 q.add(r.requestId,'cloud-second');await websiteApprovalRoundTrip(db,transport);
 expect(snapshots[0].find((x:any)=>x.id===r.requestId).status).toBe('PENDING');
 const final=snapshots[1].find((x:any)=>x.id===r.requestId);
 expect(final.status).toBe('APPLIED');expect(final.decided_by_id).toBe(uncle);
 expect(q.receipts[0].status).toBe('APPLIED');
});

it('a revoked local approver mapping refuses queued commands before apply',async()=>{
 const r=await req();await db.appUser.update({where:{id:uncle},data:{active:false}});
 const q=new Queue();q.add(r.requestId,'cloud-second');
 try{expect((await processWebsiteDecisions({db,transport:q}))[0].status).toBe('REFUSED');expect((await db.changeRequest.findUniqueOrThrow({where:{id:r.requestId}})).status).toBe('PENDING');}finally{await db.appUser.update({where:{id:uncle},data:{active:true}});}
});
it('mirror contains readable sale context but no login/session/credential fields',async()=>{
 const {approvalMirrorRows}=await import('@/lib/website/mirror');const r=await req();const mirror=(await approvalMirrorRows(db)).find(x=>x.id===r.requestId)!;
 expect(mirror.sale_context).toMatchObject({book:1,page:1,customer:'Synthetic Buyer',vehicle:'ZZ SYNTHETIC 0101'});
 for(const key of ['token','pinHash','pinSalt','password'])expect(JSON.stringify(mirror)).not.toContain(key);
});

it('cloud membership revoked after queueing refuses without local apply',async()=>{
 const r=await req();const q=new Queue();q.add(r.requestId);q.cloudActive=false;
 expect((await processWebsiteDecisions({db,transport:q}))[0].status).toBe('REFUSED');
 expect((await db.changeRequest.findUniqueOrThrow({where:{id:r.requestId}})).status).toBe('PENDING');
});
it('unverifiable current cloud membership halts before local apply and leaves ACK pending',async()=>{
 const r=await req();const q=new Queue();q.add(r.requestId);q.issuerActive=async()=>{throw Error('Synthetic membership outage')};
 await expect(processWebsiteDecisions({db,transport:q})).rejects.toThrow('membership outage');
 expect(q.receipts).toHaveLength(0);expect((await db.changeRequest.findUniqueOrThrow({where:{id:r.requestId}})).status).toBe('PENDING');
});
it('independent reject then opposite intent reports actual terminal outcome no apply',async()=>{const r=await req();const q=new Queue();q.add(r.requestId,'cloud-owner',false);q.add(r.requestId,'cloud-second',true);q.rows[0].createdAt='2026-01-01T00:00:00Z';q.rows[1].createdAt='2026-01-02T00:00:00Z';const rr=await processWebsiteDecisions({db,transport:q});expect(rr.map(x=>x.status)).toEqual(['REJECTED','REJECTED']);expect((await db.outgoingSale.findUniqueOrThrow({where:{id:r.saleId}})).remarks).toBe('before');expect((await db.changeRequest.findUniqueOrThrow({where:{id:r.requestId}})).decidedById).toBe(owner)});
it('independent approve then opposite reject truthfully stays APPLIED once',async()=>{const r=await req();const q=new Queue();q.add(r.requestId,'cloud-owner',true);q.add(r.requestId,'cloud-second',false);q.rows[0].createdAt='2026-01-01T00:00:00Z';q.rows[1].createdAt='2026-01-02T00:00:00Z';const a=await db.auditLog.count({where:{entityName:'Sale',entityId:r.saleId}});expect((await processWebsiteDecisions({db,transport:q})).map(x=>x.status)).toEqual(['APPLIED','APPLIED']);expect(await db.auditLog.count({where:{entityName:'Sale',entityId:r.saleId}})).toBe(a+1)});
it('independent stale sale fingerprint produces CONFLICT and mirrored actual state',async()=>{const r=await req();await db.outgoingSale.update({where:{id:r.saleId},data:{qty:11}});const q=new Queue();q.add(r.requestId);expect((await processWebsiteDecisions({db,transport:q}))[0].status).toBe('CONFLICT');expect((await db.outgoingSale.findUniqueOrThrow({where:{id:r.saleId}})).remarks).toBe('before');const {approvalMirrorRows}=await import('@/lib/website/mirror');expect((await approvalMirrorRows(db)).find(x=>x.id===r.requestId)?.status).toBe('CONFLICT')});
it('independent same-name different stable-id mapping cannot bypass self rejection',async()=>{const r=await req();await meta(WEBSITE_MAPPING_PREFIX+'cloud-spoof',worker);const q=new Queue();q.add(r.requestId,'cloud-spoof');expect((await processWebsiteDecisions({db,transport:q}))[0].status).toBe('REFUSED');expect((await db.changeRequest.findUniqueOrThrow({where:{id:r.requestId}})).status).toBe('PENDING')});
it('independent malformed head prevents later processing, active claim blocks FIFO',async()=>{const r=await req(),r2=await req();const q=new Queue();const a=q.add(r.requestId);q.add(r2.requestId);a.approve='true' as any;await expect(processWebsiteDecisions({db,transport:q})).rejects.toThrow('invalid command');expect(q.receipts.length).toBe(0);a.approve=true;await q.claim(a.id);expect(await processWebsiteDecisions({db,transport:q})).toEqual([]);expect((await db.changeRequest.findUniqueOrThrow({where:{id:r2.requestId}})).status).toBe('PENDING')});
it('independent mirror failure after apply retry returns truthful state no double write',async()=>{const {websiteApprovalRoundTrip}=await import('@/lib/website/round-trip');const r=await req();const q=new Queue();q.add(r.requestId);let calls=0;const transport=Object.assign(q,{mirror:async()=>{if(++calls===2)throw Error('synthetic mirror outage')}});await expect(websiteApprovalRoundTrip(db,transport)).rejects.toThrow('mirror outage');const a=await db.auditLog.count({where:{entityName:'Sale',entityId:r.saleId}});await websiteApprovalRoundTrip(db,transport);expect(await db.auditLog.count({where:{entityName:'Sale',entityId:r.saleId}})).toBe(a);expect((await db.changeRequest.findUniqueOrThrow({where:{id:r.requestId}})).status).toBe('APPLIED')});

it('independent cloud principal mismatch refused and membership outage not acknowledged',async()=>{const r=await req();const q=new Queue();q.add(r.requestId);let checked:any[]=[];q.issuerActive=async(issuer,principal)=>{checked.push([issuer,principal]);return false};expect((await processWebsiteDecisions({db,transport:q}))[0].status).toBe('REFUSED');expect(checked).toEqual([['cloud-owner',owner]]);expect((await db.changeRequest.findUniqueOrThrow({where:{id:r.requestId}})).status).toBe('PENDING')});
it('independent disabled runner never touches provider or DB',async()=>{const{runConfiguredWebsiteBridge}=await import('@/lib/website/runner');const proxy=new Proxy({},{get(){throw Error('unexpected effect')}});expect(await runConfiguredWebsiteBridge({enabled:false,db:proxy as any,approvedServiceClient:proxy})).toEqual({state:'DISABLED',receipts:[]});await expect(runConfiguredWebsiteBridge({enabled:true,db,verifiedProjectId:'label'})).rejects.toThrow('incomplete')});
