import type { PrismaClient } from '@prisma/client';
import { websiteApprovalRoundTrip } from './round-trip';
import { websiteProviderTransport } from './provider-adapter';

// Explicit, server-internal launch point. Disabled by default, never an action
// accepting arbitrary clients from a browser. No ambient env / anon fallback.
// Runtime wiring remains uninstalled until the actual provider gate is passed.
export async function runConfiguredWebsiteBridge(config: {
  enabled: boolean;
  verifiedProjectId?: string;
  db: PrismaClient;
  approvedServiceClient?: unknown;
}) {
  if (!config.enabled) return { state: 'DISABLED' as const, receipts: [] };
  if (!config.verifiedProjectId || !config.approvedServiceClient) throw new Error('Website bridge provider setup is incomplete.');
  return { state:'CHECKED' as const, receipts:await websiteApprovalRoundTrip(config.db,websiteProviderTransport(config.approvedServiceClient)) };
}
