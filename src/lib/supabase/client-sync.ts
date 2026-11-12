import { createHash } from 'node:crypto';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

type SyncClient = SupabaseClient<any>;
type Slot = { fingerprint: string; client: SyncClient; verifiedAt: number };
type Lifecycle = { tail: Promise<void>; slot?: Slot; failure?: { fingerprint: string; until: number } };
const host = globalThis as typeof globalThis & { __MBM_PRIVATE_SYNC_LIFECYCLE_V1__?: Lifecycle };
const lifecycle = host.__MBM_PRIVATE_SYNC_LIFECYCLE_V1__ ??= { tail: Promise.resolve() };
const VERIFY_EVERY_MS = 60_000;
const FAILURE_BACKOFF_MS = 30_000;
const LOGIN_ERROR = 'Private device sync login could not be verified.';

// One private in-memory session per server process, not a browser session or
// installer secret. Serializing lifecycle transitions also makes initial login
// and periodic verification single-flight across Next server bundles.
async function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const previous = lifecycle.tail;
  let release!: () => void;
  lifecycle.tail = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try { return await work(); } finally { release(); }
}
async function retire(client: SyncClient) {
  // Stop even when remote logout is unavailable. Never retain another refresh
  // ticker after config change, verification failure or explicit shutdown.
  await client.auth.stopAutoRefresh().catch(() => undefined);
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
}
export async function disposeSyncClient(): Promise<void> {
  await exclusive(async () => {
    const previous = lifecycle.slot;
    lifecycle.slot = undefined;
    lifecycle.failure = undefined;
    if (previous) await retire(previous.client);
  });
}
function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const username = process.env.MBM_SYNC_USERNAME;
  const password = process.env.MBM_SYNC_PASSWORD;
  const expectedUserId = process.env.MBM_SYNC_USER_ID;
  if (!url || !publicKey || !username || !password || !expectedUserId) throw new Error('Private device sync login is not configured.');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Private device sync project is invalid.'); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'slgkzhchczgvfhryejqu.supabase.co' || parsed.pathname !== '/') throw new Error('Private device sync project is invalid.');
  if (!isPublicClientKey(publicKey)) throw new Error('Device sync requires a public client key, not an administrative key.');
  const fingerprint = createHash('sha256').update(JSON.stringify([url, publicKey, username, password, expectedUserId])).digest('hex');
  return { url, publicKey, username, password, expectedUserId, fingerprint };
}
function matches(user: { id?: string; role?: string } | null | undefined, id: string) {
  return user?.id === id && user.role === 'authenticated';
}
export async function createSyncClient(): Promise<SyncClient> {
  return exclusive(async () => {
    let config: ReturnType<typeof configuration>;
    try { config = configuration(); }
    catch (error) {
      const previous = lifecycle.slot;
      lifecycle.slot = undefined;
      lifecycle.failure = undefined;
      if (previous) await retire(previous.client);
      throw error;
    }
    if (lifecycle.slot && lifecycle.slot.fingerprint !== config.fingerprint) {
      const previous = lifecycle.slot;
      lifecycle.slot = undefined;
      await retire(previous.client);
    }
    const now = Date.now();
    if (lifecycle.failure?.fingerprint === config.fingerprint && now < lifecycle.failure.until) throw new Error(LOGIN_ERROR);
    const existing = lifecycle.slot;
    if (existing) {
      const age = now - existing.verifiedAt;
      if (age >= 0 && age < VERIFY_EVERY_MS) return existing.client;
      try {
        const verified = await existing.client.auth.getUser();
        if (verified.error || !matches(verified.data.user, config.expectedUserId)) throw new Error(LOGIN_ERROR);
        existing.verifiedAt = Date.now();
        lifecycle.failure = undefined;
        return existing.client;
      } catch {
        lifecycle.slot = undefined;
        lifecycle.failure = { fingerprint: config.fingerprint, until: Date.now() + FAILURE_BACKOFF_MS };
        await retire(existing.client);
        throw new Error(LOGIN_ERROR);
      }
    }
    const client = createSupabaseClient(config.url, config.publicKey, {
      auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
    });
    try {
      const { data, error } = await client.auth.signInWithPassword({ email: config.username, password: config.password });
      if (error || !data.session || !matches(data.user, config.expectedUserId)) throw new Error(LOGIN_ERROR);
      const verified = await client.auth.getUser();
      if (verified.error || !matches(verified.data.user, config.expectedUserId)) throw new Error(LOGIN_ERROR);
      lifecycle.slot = { fingerprint: config.fingerprint, client, verifiedAt: Date.now() };
      lifecycle.failure = undefined;
      return client;
    } catch {
      lifecycle.failure = { fingerprint: config.fingerprint, until: Date.now() + FAILURE_BACKOFF_MS };
      await retire(client);
      throw new Error(LOGIN_ERROR);
    }
  });
}
function isPublicClientKey(key: string) {
  if (key.startsWith('sb_publishable_')) return true;
  if (key.startsWith('sb_secret_')) return false;
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    return payload.role === 'anon';
  } catch { return false; }
}
