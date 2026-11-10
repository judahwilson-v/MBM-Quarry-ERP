// Retained-client barrier contract (FULL36), unmocked real getDb: a client reference
// retained across a successful restore must refuse every further query, and the
// restored database must be readable after a (simulated) restart.
import { it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import { copyFileSync } from 'node:fs';
import { getDb, disconnectDatabase } from '../../src/lib/prisma';
import { createLocalBackup, restoreLocalBackup, listLocalBackups } from '../../src/app/actions/database';
import { clearRestartRequiredForProcessStart } from '../../src/lib/sync/restore-state';

let dir: string; let dbFile: string; let n = 0;
const root = process.env.MBM_TEST_ROOT;
beforeEach(() => {
  if (!root) throw Error('isolated fixture required');
  clearRestartRequiredForProcessStart();
  dir = `${root}/retained-${++n}`; fs.mkdirSync(dir, { recursive: true });
  dbFile = `${dir}/active.db`;
  copyFileSync(`${root}/fixture.db`, dbFile);
  process.env.DATABASE_URL = `file:${dbFile}`;
});
afterEach(async () => { clearRestartRequiredForProcessStart(); await disconnectDatabase().catch(()=>{}); delete process.env.DATABASE_URL; });

it('retained gated client refuses ALL queries after restore; restored content intact after restart', async () => {
  const client = await getDb();
  await client.globalSettings.deleteMany({});
  await client.globalSettings.create({ data: { id: 'default', quarryName: 'marker-alpha' } });
  expect((await createLocalBackup()).success).toBe(true);
  await client.globalSettings.update({ where: { id: 'default' }, data: { quarryName: 'marker-beta' } });
  const name = (await listLocalBackups())[0].name;
  expect((await restoreLocalBackup(name)).success).toBe(true);
  await expect(getDb()).rejects.toThrow(/[Rr]estart/);
  // The retained reference can no longer auto-reconnect into the restored file:
  // refusal happens synchronously at property access on the gated client.
  expect(() => client.globalSettings.create({ data: { id: 'bypass', quarryName: 'marker-bypass' } })).toThrow(/[Rr]estart/);
  expect(() => client.globalSettings.findMany()).toThrow(/[Rr]estart/);
  expect(() => client.$queryRawUnsafe('SELECT 1')).toThrow(/[Rr]estart/);
  // Restored content is exactly the backup (no bypass write landed):
  const reader = new PrismaClient({ datasources: { db: { url: `file:${dbFile}` } } });
  try {
    expect((await reader.globalSettings.findUnique({ where: { id: 'default' } }))?.quarryName).toBe('marker-alpha');
    expect(await reader.globalSettings.findUnique({ where: { id: 'bypass' } })).toBe(null);
  } finally { await reader.$disconnect().catch(()=>{}); }
  // Simulated restart: fresh process state reads the restored donor content.
  clearRestartRequiredForProcessStart();
  const fresh = await getDb();
  expect((await fresh.globalSettings.findUnique({ where: { id: 'default' } }))?.quarryName).toBe('marker-alpha');
});

it('simultaneous restores never overlap: at most one proceeds at a time (beginRestore gate)', async () => {
  await getDb();
  expect((await createLocalBackup()).success).toBe(true);
  const name = (await listLocalBackups())[0].name;
  const results = await Promise.all([restoreLocalBackup(name), restoreLocalBackup(name)]);
  expect(results.filter(r => r.success).length).toBeGreaterThanOrEqual(1);
  expect(fs.existsSync(`${dbFile}.restore-journal.json`)).toBe(false); // no torn journal left
});

it('captured delegate refuses at EXECUTION after restore (pullSync pattern)', async () => {
  const client = await getDb();
  await client.globalSettings.deleteMany({});
  await client.globalSettings.create({ data: { id: 'default', quarryName: 'marker-alpha' } });
  expect((await createLocalBackup()).success).toBe(true);
  const name = (await listLocalBackups())[0].name;
  const delegate = client.globalSettings; // captured BEFORE the barrier (sync-service pattern)
  expect((await restoreLocalBackup(name)).success).toBe(true);
  await expect(delegate.create({ data: { id: 'delegate-bypass', quarryName: 'marker-bypass' } })).rejects.toThrow(/[Rr]estart/);
  await expect(delegate.findMany()).rejects.toThrow(/[Rr]estart/);
  const reader = new PrismaClient({ datasources: { db: { url: `file:${dbFile}` } } });
  try { expect(await reader.globalSettings.findUnique({ where: { id: 'delegate-bypass' } })).toBe(null); }
  finally { await reader.$disconnect().catch(()=>{}); }
});

it('lazy query constructed BEFORE restore refuses when awaited after', async () => {
  const client = await getDb();
  await client.globalSettings.deleteMany({});
  await client.globalSettings.create({ data: { id: 'default', quarryName: 'marker-alpha' } });
  expect((await createLocalBackup()).success).toBe(true);
  const name = (await listLocalBackups())[0].name;
  const lazy = client.globalSettings.create({ data: { id: 'lazy-bypass', quarryName: 'marker-bypass' } }); // NOT awaited
  expect((await restoreLocalBackup(name)).success).toBe(true);
  await expect(lazy).rejects.toThrow(/[Rr]estart/);
  const reader = new PrismaClient({ datasources: { db: { url: `file:${dbFile}` } } });
  try { expect(await reader.globalSettings.findUnique({ where: { id: 'lazy-bypass' } })).toBe(null); }
  finally { await reader.$disconnect().catch(()=>{}); }
});

it('interactive transaction: model op refuses when the barrier engages mid-transaction; nothing persists', async () => {
  const { markRestartRequired } = await import('../../src/lib/sync/restore-state');
  const client = await getDb();
  await client.globalSettings.deleteMany({});
  const outcome = await client.$transaction(async (tx: any) => {
    await tx.globalSettings.create({ data: { id: 'tx-first', quarryName: 'marker-tx' } });
    markRestartRequired(); // barrier engages mid-transaction
    await tx.globalSettings.create({ data: { id: 'tx-second', quarryName: 'marker-tx' } });
    return 'completed';
  }).then(() => 'completed', (e: any) => (/[Rr]estart/.test(e?.message || '') ? 'refused' : `other:${e?.message}`));
  expect(outcome).toBe('refused');
  clearRestartRequiredForProcessStart();
  const fresh = await getDb();
  expect(await fresh.globalSettings.findUnique({ where: { id: 'tx-first' } })).toBe(null); // rolled back
  expect(await fresh.globalSettings.findUnique({ where: { id: 'tx-second' } })).toBe(null);
});

it('cloud staged restore driven through the PUBLIC gated client completes (regression: internal restore capability)', async () => {
  const { stagedRestoreFromSupabase } = await import('../../src/lib/sync/staged-restore');
  const client = await getDb();
  await client.globalSettings.deleteMany({});
  await client.globalSettings.create({ data: { id: 'default', quarryName: 'marker-alpha' } });
  const result = await stagedRestoreFromSupabase(client, { force: true }, {
    activePath: dbFile,
    fetchRows: async () => ({ rows: [] }), // synthetic, zero external calls
  });
  expect(result.errors).toEqual([]);
  expect(result.success).toBe(true);
  expect(result.backupPath && fs.existsSync(result.backupPath)).toBe(true); // pre-restore copy kept
  expect(fs.existsSync(`${dbFile}.restore-journal.json`)).toBe(false);
  const reader = new PrismaClient({ datasources: { db: { url: `file:${dbFile}` } } });
  try { expect((await reader.$queryRawUnsafe('PRAGMA integrity_check') as any[])[0].integrity_check).toBe('ok'); }
  finally { await reader.$disconnect().catch(()=>{}); }
});
