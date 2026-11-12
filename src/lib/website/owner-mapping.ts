import type { Actor } from '@/app/actions/auth';

// A private, owner-provisioned attribution record, NOT a desktop login.
// Keep in local AppMeta (already preserved during database restore), never
// legacy cloud row-sync, audit payloads, browser input or public metadata.
export type WebsiteOwnerMapping = { version: 1; id: string; name: string; active: boolean };
export function parseWebsiteOwnerMapping(value: string | null | undefined): Actor | null {
  if (!value) return null;
  try {
    const v: unknown = JSON.parse(value);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const row = v as Record<string, unknown>;
    if (Object.keys(row).sort().join(',') !== 'active,id,name,version' || row.version !== 1 || row.active !== true ||
        typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.id) ||
        typeof row.name !== 'string' || !row.name.trim() || row.name.length > 128) return null;
    return { id: row.id, name: row.name, role: 'website-owner' };
  } catch { return null; }
}
