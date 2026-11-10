/**
 * Local-only approval bridge prototype. NOT scheduled, NOT provider-wired.
 * Transport methods are a contract, not evidence of deployed RPCs/RLS.
 * Server owns the provider adapter and local membership. No Server Action
 * accepts this dependency set or a client-supplied actor as authority.
 */
import type { PrismaClient } from '@prisma/client';
import { decideChangeRequestAsVerifiedActor } from '@/lib/domain/change-requests/decision-service';

export type DecisionIntent = {
  id: string;
  requestId: string;
  approve: boolean;
  note: string | null;
  issuerUserId: string; // provider-authenticated stable id, never metadata/name
  createdAt: string;
};
export type DecisionReceipt = {
  intentId: string;
  requestId: string;
  status: 'APPLIED' | 'REJECTED' | 'CONFLICT' | 'CANCELLED' | 'REFUSED';
  message: string;
};
export interface DecisionTransport {
  // Provider must return ordered unfinished commands, including expired claims.
  pending(): Promise<DecisionIntent[]>;
  // Fresh provider membership check after claim; no cached metadata.
  issuerActive(issuerUserId: string, principalId: string): Promise<boolean>;
  // Atomic conditional claim + expiry + opaque fencing token; provider authority.
  claim(id: string): Promise<string | null>;
  // Must match current fencing token; idempotent for this intent and result.
  acknowledge(id: string, fence: string, receipt: DecisionReceipt): Promise<void>;
}

// Local owner-provisioned mapping only. No client, website display name or
// remotely writable directory may create/update this value.
export const WEBSITE_MAPPING_PREFIX = 'website_approver_user:';

export async function processWebsiteDecisions(deps: {
  db: PrismaClient;
  transport: DecisionTransport;
}) {
  const pending = await deps.transport.pending();
  const ordered = pending; // transport's authoritative sequence, not timestamps
  const receipts: DecisionReceipt[] = [];
  for (const intent of ordered) {
    if (!intent.id || !intent.requestId || typeof intent.approve !== 'boolean' ||
        !intent.issuerUserId || !Number.isFinite(Date.parse(intent.createdAt)) ||
        (intent.note !== null && typeof intent.note !== 'string')) {
      throw new Error('The website decision queue contains an invalid command. No later commands were processed.');
    }
    const fence = await deps.transport.claim(intent.id);
    if (!fence) break; // FIFO: an earlier active claimant may still be deciding
    const mapping = await deps.db.appMeta.findUnique({ where: { key: WEBSITE_MAPPING_PREFIX + intent.issuerUserId } });
    let receipt: DecisionReceipt;
    const actor = mapping?.value ? await deps.db.appUser.findUnique({ where: { id: mapping.value } }) : null;
    if (!actor?.active || !(await deps.transport.issuerActive(intent.issuerUserId, actor.id))) {
      receipt = { intentId: intent.id, requestId: intent.requestId, status: 'REFUSED', message: 'This website login is not mapped to an active owner-provisioned approver.' };
    } else {
      const request = await deps.db.changeRequest.findUnique({ where: { id: intent.requestId } });
      if (!request || request.requestedById === actor.id) {
        receipt = { intentId: intent.id, requestId: intent.requestId, status: 'REFUSED', message: !request ? 'The app has no matching request.' : 'You cannot approve or reject your own request.' };
        await deps.transport.acknowledge(intent.id, fence, receipt);
        receipts.push(receipt);
        continue;
      }
      // This preserves the existing stable-ID self-approval refusal and all
      // sale fingerprint, PENDING-claim, transaction and accounting checks.
      const result = await decideChangeRequestAsVerifiedActor(intent.requestId, { approve: intent.approve, note: intent.note ?? undefined }, { id: actor.id, name: actor.name, role: actor.role });
      const status = 'request' in result ? result.request?.status : undefined;
      const terminal = status === 'APPLIED' || status === 'REJECTED' || status === 'CONFLICT' || status === 'CANCELLED';
      receipt = { intentId: intent.id, requestId: intent.requestId, status: terminal ? status : 'REFUSED', message: terminal ? `The app records this request as ${status.toLowerCase()}.` : 'The app refused this decision. No change was applied.' };
      if (!terminal && !('request' in result)) {
        // A refusal may be transient (DB unavailable) or permanent (self-
        // approval). Keep it pending; do not erase retryable work with an ACK.
        // No status guessed from an error string.
        break;
      }
    }
    // If the process/ACK fails after local apply, the lease expires and a
    // retry re-enters decideChangeRequest. Its terminal-state replay never
    // applies the sale a second time. Local mutation and remote ACK are NOT
    // one transaction; this is recovery through replay, not exactly-once RPC.
    await deps.transport.acknowledge(intent.id, fence, receipt);
    receipts.push(receipt);
  }
  return receipts;
}
