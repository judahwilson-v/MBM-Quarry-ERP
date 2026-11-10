import {it,expect,vi} from 'vitest';
import {websiteProviderTransport} from '@/lib/website/provider-adapter';
it('claim and ACK call only the explicit provider contract with fencing',async()=>{
 const rpc=vi.fn().mockResolvedValueOnce({data:'fence',error:null}).mockResolvedValueOnce({data:true,error:null});
 const t=websiteProviderTransport({rpc});expect(await t.claim('intent')).toBe('fence');
 const receipt={intentId:'intent',requestId:'request',status:'APPLIED' as const,message:'app outcome'};
 await t.acknowledge('intent','fence',receipt);
 expect(rpc.mock.calls).toEqual([['website_claim_decision',{p_id:'intent'}],['website_acknowledge_decision',{p_id:'intent',p_fence:'fence',p_receipt:receipt}]]);
});
it('provider claim errors and invalid ACK never pretend delivery',async()=>{
 const t=websiteProviderTransport({rpc:async()=>({data:false,error:{message:'synthetic unavailable'}})});
 await expect(t.claim('id')).rejects.toThrow('could not be claimed');await expect(t.acknowledge('id','fence',{intentId:'id',requestId:'r',status:'REFUSED',message:'refused'})).rejects.toThrow('not acknowledged');
});
it('pending queue reads provider sequence and maps the authenticated issuer ID',async()=>{
 const order=vi.fn();const chain:any={select:()=>chain,is:()=>chain,order:async(...args:any[])=>{order(...args);return {data:[{id:'i',request_id:'r',approve:true,note:null,issuer_user_id:'cloud-stable',created_at:'2026-01-01T00:00:00Z'}],error:null}}};
 const t=websiteProviderTransport({from:()=>chain});expect((await t.pending())[0].issuerUserId).toBe('cloud-stable');expect(order).toHaveBeenCalledWith('sequence',{ascending:true});
});
it('disabled runner does not create a client or make provider calls',async()=>{const {runConfiguredWebsiteBridge}=await import('@/lib/website/runner');const db=new Proxy({},{get(){throw Error('DB must not be used')}});expect((await runConfiguredWebsiteBridge({enabled:false,db:db as any})).state).toBe('DISABLED');await expect(runConfiguredWebsiteBridge({enabled:true,db:db as any})).rejects.toThrow('setup is incomplete');});
