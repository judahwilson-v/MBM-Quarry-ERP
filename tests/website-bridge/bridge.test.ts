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
async function mapping(id:string,active=true) { const u=await db.appUser.findUniqueOrThrow({where:{id}}); return JSON.stringify({version:1,id,name:u.name,active}); }
async function meta(key:string,value:string) { await db.appMeta.upsert({where:{key},create:{key,value},update:{value}}); }
beforeAll(async () => {
 worker=(await user('Synthetic Worker')).id; owner=(await user('Synthetic Owner')).id; uncle=(await user('Synthetic Second Approver')).id;
 wt=await session(worker); ot=await session(owner);
 await meta(ENROLLMENT_KEY,'true'); await meta(CONTROL_PRINCIPAL_KEY,owner);
 await meta(WEBSITE_MAPPING_PREFIX+'cloud-owner',await mapping(owner)); await meta(WEBSITE_MAPPING_PREFIX+'cloud-second',await mapping(uncle));
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
 const r=await req();await meta(WEBSITE_MAPPING_PREFIX+'cloud-second',await mapping(uncle,false));
 const q=new Queue();q.add(r.requestId,'cloud-second');
 try{expect((await processWebsiteDecisions({db,transport:q}))[0].status).toBe('REFUSED');expect((await db.changeRequest.findUniqueOrThrow({where:{id:r.requestId}})).status).toBe('PENDING');}finally{await meta(WEBSITE_MAPPING_PREFIX+'cloud-second',await mapping(uncle,true));}
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

it('website-only owner without any AppUser or desktop session can approve with stable audit identity',async()=>{
 const id=randomUUID();expect(await db.appUser.findUnique({where:{id}})).toBeNull();
 await meta(WEBSITE_MAPPING_PREFIX+'cloud-website-only',JSON.stringify({version:1,id,name:'Synthetic Website Only',active:true}));
 const r=await req();const q=new Queue();q.add(r.requestId,'cloud-website-only');q.issuerActive=async(issuer,principal)=>issuer==='cloud-website-only'&&principal===id;
 expect((await processWebsiteDecisions({db,transport:q}))[0].status).toBe('APPLIED');const row=await db.changeRequest.findUniqueOrThrow({where:{id:r.requestId}});expect(row.decidedById).toBe(id);expect(row.decidedByName).toBe('Synthetic Website Only');expect(await db.appUser.findUnique({where:{id}})).toBeNull();
});
it('malformed, credential-bearing and legacy local mapping refuses without manufacturing an actor',async()=>{
 const {parseWebsiteOwnerMapping}=await import('@/lib/website/owner-mapping');
 for(const value of ['not-json',owner,'null','[]',JSON.stringify({version:1,id:'actor',name:'Owner',active:false}),JSON.stringify({version:1,id:'actor',name:'Owner',active:true,password:'synthetic-should-not-be-read'})])expect(parseWebsiteOwnerMapping(value)).toBeNull();
 const r=await req();await meta(WEBSITE_MAPPING_PREFIX+'cloud-invalid',owner);const q=new Queue();q.add(r.requestId,'cloud-invalid');expect((await processWebsiteDecisions({db,transport:q}))[0].status).toBe('REFUSED');expect((await db.changeRequest.findUniqueOrThrow({where:{id:r.requestId}})).status).toBe('PENDING');
});
