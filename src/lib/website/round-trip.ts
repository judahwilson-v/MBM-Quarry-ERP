import type { PrismaClient } from '@prisma/client';
import { approvalMirrorRows } from './mirror';
import { processWebsiteDecisions, type DecisionTransport } from './decision-bridge';

// Explicit invocation only. Not wired to auto-sync or any provider client.
export async function websiteApprovalRoundTrip(db:PrismaClient, transport:DecisionTransport & {
  mirror(rows:Awaited<ReturnType<typeof approvalMirrorRows>>):Promise<void>;
}) {
  await transport.mirror(await approvalMirrorRows(db));
  const receipts=await processWebsiteDecisions({db,transport});
  // Re-publish actual terminal state even when it disagrees with a command.
  await transport.mirror(await approvalMirrorRows(db));
  return receipts;
}
