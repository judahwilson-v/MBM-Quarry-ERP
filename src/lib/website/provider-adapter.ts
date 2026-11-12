import type { DecisionIntent, DecisionReceipt, DecisionTransport } from './decision-bridge';
import type { approvalMirrorRows } from './mirror';

// Proposed provider adapter, explicitly constructed by a future approved
// desktop wiring step. This file creates no client and is not in auto-sync.
// Its caller must own the verified restricted desktop sync client. An anon/website client is NOT
// equivalent and the proposed RPC grants must enforce that on the provider.
export function websiteProviderTransport(client: any): DecisionTransport & {
  mirror(rows: Awaited<ReturnType<typeof approvalMirrorRows>>): Promise<void>;
} {
  return {
    async pending() {
      const { data, error } = await client.from('website_decision_intents').select('id,request_id,approve,note,issuer_user_id,created_at')
        .is('acknowledged_at',null).order('sequence',{ascending:true});
      if (error || !Array.isArray(data)) throw new Error('The website decision queue could not be read.');
      return data.map((r:any):DecisionIntent=>({id:r.id,requestId:r.request_id,approve:r.approve,note:r.note,issuerUserId:r.issuer_user_id,createdAt:r.created_at}));
    },
    async issuerActive(issuerUserId:string, principalId:string) {
      const { data, error } = await client.from('website_approver_principals')
        .select('principal_id,active').eq('supabase_user_id',issuerUserId).single();
      if (error) throw new Error('Current website approver membership could not be verified.');
      return !!data?.active && data.principal_id===principalId;
    },
    async claim(id:string) {
      const { data, error } = await client.rpc('website_claim_decision',{p_id:id});
      if (error) throw new Error('The website decision could not be claimed.');
      if (data !== null && typeof data !== 'string') throw new Error('The website claim response is invalid.');
      return data;
    },
    async acknowledge(id:string,fence:string,receipt:DecisionReceipt) {
      const { data, error } = await client.rpc('website_acknowledge_decision',{p_id:id,p_fence:fence,p_receipt:receipt});
      if (error || data!==true) throw new Error('The website result was not acknowledged.');
    },
    async mirror(rows) {
      if (!rows.length) return;
      const { error } = await client.from('website_change_requests').upsert(rows,{onConflict:'id'});
      if (error) throw new Error('The website request mirror could not be updated.');
    },
  };
}
