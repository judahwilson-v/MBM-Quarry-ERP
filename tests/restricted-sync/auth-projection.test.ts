import { it, expect, vi, beforeEach, afterEach } from 'vitest';
const state = vi.hoisted(() => ({ make: vi.fn(), signIn: vi.fn(), getUser: vi.fn(), signOut: vi.fn(), stop:vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({createClient: state.make}));
import { createSyncClient, disposeSyncClient } from '@/lib/supabase/client-sync';
import { syncReadProjection, syncResponseRows } from '@/lib/sync/read-projection';
const uid='synthetic-sync-id';
beforeEach(async()=>{
 await disposeSyncClient();
 vi.unstubAllEnvs(); vi.clearAllMocks();
 for (const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','MBM_SYNC_USERNAME','MBM_SYNC_PASSWORD','MBM_SYNC_USER_ID','SUPABASE_SECRET_KEY']) vi.stubEnv(key,'');
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://slgkzhchczgvfhryejqu.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','sb_publishable_SYNTHETIC_NOT_A_KEY');
 vi.stubEnv('MBM_SYNC_USERNAME','synthetic@fixture.invalid');vi.stubEnv('MBM_SYNC_PASSWORD','synthetic-not-a-secret');vi.stubEnv('MBM_SYNC_USER_ID',uid);
 state.signIn.mockResolvedValue({data:{session:{},user:{id:uid,role:'authenticated'}},error:null});state.getUser.mockResolvedValue({data:{user:{id:uid,role:'authenticated'}},error:null});state.signOut.mockResolvedValue({error:null});state.stop.mockResolvedValue(undefined);
 state.make.mockReturnValue({auth:{signInWithPassword:state.signIn,getUser:state.getUser,signOut:state.signOut,stopAutoRefresh:state.stop}});
});
it('requires private device login, no administrative or anonymous fallback',async()=>{vi.stubEnv('MBM_SYNC_PASSWORD','');vi.stubEnv('SUPABASE_SECRET_KEY','synthetic-admin');await expect(createSyncClient()).rejects.toThrow('not configured');expect(state.make).not.toHaveBeenCalled()});
it('rejects wrong project before sending device password',async()=>{vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://wrong-project.invalid');await expect(createSyncClient()).rejects.toThrow('project is invalid');expect(state.make).not.toHaveBeenCalled()});
it('rejects administrative public-key substitution',async()=>{vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','sb_secret_SYNTHETIC');await expect(createSyncClient()).rejects.toThrow('administrative');expect(state.signIn).not.toHaveBeenCalled()});
it('signs in normally, verifies server user and uses no persistent shared session',async()=>{await createSyncClient();expect(state.signIn).toHaveBeenCalledWith({email:'synthetic@fixture.invalid',password:'synthetic-not-a-secret'});expect(state.getUser).toHaveBeenCalledOnce();expect(state.make.mock.calls[0][2].auth.persistSession).toBe(false)});
it('refuses mismatched account without leaking provider error',async()=>{state.signIn.mockResolvedValue({data:{session:{},user:{id:'wrong',role:'authenticated'}},error:null});await expect(createSyncClient()).rejects.toThrow('could not be verified');expect(state.getUser).not.toHaveBeenCalled();expect(state.signOut).toHaveBeenCalledOnce()});
it('refuses unverifiable current user',async()=>{state.getUser.mockResolvedValue({data:{user:null},error:{message:'synthetic private provider detail'}});await expect(createSyncClient()).rejects.toThrow('could not be verified');expect(state.signOut).toHaveBeenCalledOnce()});
it('settings projection excludes credentials, other sync tables unchanged',()=>{const fields=syncReadProjection('global_settings').split(',');expect(fields).toContain('quarry_name');expect(fields).not.toContain('admin_pin');expect(fields).not.toContain('delete_pin');expect(syncReadProjection('outgoing_sales')).toBe('*')});
it('dynamic rows are runtime checked before typed use',()=>{expect(syncResponseRows([{id:'synthetic'}])).toEqual([{id:'synthetic'}]);expect(syncResponseRows(null)).toEqual([]);expect(()=>syncResponseRows('invalid')).toThrow('invalid');expect(()=>syncResponseRows([null])).toThrow('invalid')});

it('cloud settings restore keeps only current local credentials and never a remote PIN',async()=>{
 const {preserveLocalSettingsSecrets}=await import('@/lib/sync/local-settings-restore');
 const local=[{id:'settings',adminPin:'synthetic-local-a',deletePin:'synthetic-local-d'}];
 expect(preserveLocalSettingsSecrets([{id:'settings',quarry_name:'Synthetic',admin_pin:'remote-ignored',deletePin:'remote-ignored'}],local)).toEqual([{id:'settings',quarry_name:'Synthetic',adminPin:'synthetic-local-a',deletePin:'synthetic-local-d'}]);
 expect(()=>preserveLocalSettingsSecrets([{id:'other'}],local)).toThrow('cannot preserve');
});

it('restore public failure never exposes merged local credentials from ORM diagnostics',async()=>{const {safeCloudRestoreError}=await import('@/lib/sync/local-settings-restore');const e=new Error('Invalid Prisma create invocation adminPin: synthetic-local-a deletePin: synthetic-local-d');expect(safeCloudRestoreError(e)).not.toMatch(/synthetic-local|adminPin|Prisma/);expect(safeCloudRestoreError(new Error('Required field GlobalSettings.updatedAt is null or missing in remote data'))).toContain('Required field')});

afterEach(async()=>{await disposeSyncClient();vi.restoreAllMocks();});
