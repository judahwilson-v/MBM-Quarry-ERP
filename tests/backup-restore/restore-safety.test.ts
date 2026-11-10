import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { copyFileSync } from 'node:fs';
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('@/lib/prisma',async(importOriginal)=>{const mod=await importOriginal<any>();return {...mod,getDb:async()=>state.db};});
import { createLocalBackup, restoreLocalBackup, listLocalBackups } from '../../src/app/actions/database';
import { assertRestartNotRequired, clearRestartRequiredForProcessStart } from '../../src/lib/sync/restore-state';
import { startRestoreJournal, updateRestoreJournal, recoverInterruptedRestore } from '../../src/lib/sync/restore-files';

// Restore-safety contract: validate-before-swap, journaled swap with rollback copy,
// restart write barrier. Markers are neutral strings - no credential-shaped values.
let dir: string; let dbFile: string; let n = 0;
const root = process.env.MBM_TEST_ROOT;
beforeEach(() => {
  if (!root) throw Error('isolated fixture required');
  clearRestartRequiredForProcessStart();
  dir = `${root}/safety-${++n}`; fs.mkdirSync(dir, { recursive: true });
  dbFile = `${dir}/active.db`;
  copyFileSync(`${root}/fixture.db`, dbFile);
  process.env.DATABASE_URL = `file:${dbFile}`;
  state.db = new PrismaClient({ datasources: { db: { url: `file:${dbFile}` } } });
});
afterEach(async () => { clearRestartRequiredForProcessStart(); await state.db.$disconnect().catch(()=>{}); delete process.env.DATABASE_URL; });

async function marker(value: string) {
  await state.db.globalSettings.deleteMany({});
  await state.db.globalSettings.create({ data: { id: 'default', quarryName: value } });
}
async function markerIn(file: string) {
  const r = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  try { return (await r.globalSettings.findUnique({ where: { id: 'default' } }))?.quarryName; }
  finally { await r.$disconnect().catch(()=>{}); }
}

it('malformed backups are refused with ZERO write to the active database', async () => {
  await marker('marker-alpha');
  const before = fs.readFileSync(dbFile);
  const backupsDir = path.join(dir, 'backups'); fs.mkdirSync(backupsDir, { recursive: true });
  fs.writeFileSync(path.join(backupsDir, 'garbage.bak'), 'this is not a sqlite database at all');
  expect((await restoreLocalBackup('garbage.bak')).success).toBe(false);
  expect(fs.readFileSync(dbFile)).toEqual(before);
  expect(await markerIn(dbFile)).toBe('marker-alpha');
});

it('valid-header truncated backup is refused with ZERO write', async () => {
  await marker('marker-alpha');
  expect((await createLocalBackup()).success).toBe(true);
  const good = path.join(dir, 'backups', (await listLocalBackups())[0].name);
  fs.writeFileSync(path.join(dir, 'backups', 'truncated.bak'), fs.readFileSync(good).subarray(0, 4096));
  const before = fs.readFileSync(dbFile);
  expect((await restoreLocalBackup('truncated.bak')).success).toBe(false);
  expect(fs.readFileSync(dbFile)).toEqual(before);
});

it('valid backup restores with pre-restore rollback copy kept and restart barrier engaged', async () => {
  await marker('marker-alpha');
  expect((await createLocalBackup()).success).toBe(true);
  await marker('marker-beta'); // diverge after backup
  const name = (await listLocalBackups())[0].name;
  const r = await restoreLocalBackup(name);
  expect(r.success).toBe(true);
  expect(await markerIn(dbFile)).toBe('marker-alpha'); // restored content
  const siblings = fs.readdirSync(dir).filter(f => f.includes('.pre-restore-'));
  expect(siblings.length).toBe(1); // rollback copy preserved
  expect(await markerIn(path.join(dir, siblings[0]))).toBe('marker-beta');
  expect(fs.existsSync(`${dbFile}.restore-journal.json`)).toBe(false); // journal cleared
  expect(() => assertRestartNotRequired()).toThrow(/[Rr]estart/); // barrier engaged
  clearRestartRequiredForProcessStart(); // simulated restart
  expect(() => assertRestartNotRequired()).not.toThrow();
});

it('crash between moves recovers the last known good database (journal phase backup-moved)', async () => {
  await marker('marker-alpha');
  const preRestore = `${dbFile}.pre-restore-synthetic.bak`;
  copyFileSync(dbFile, preRestore);
  fs.rmSync(dbFile); // simulate crash after the active file was moved aside
  startRestoreJournal(dbFile, preRestore, `${dbFile}.restore-stage`);
  updateRestoreJournal(dbFile, 'backup-moved');
  expect(recoverInterruptedRestore(dbFile)).toBe(true);
  expect(await markerIn(dbFile)).toBe('marker-alpha'); // good copy recovered
  expect(fs.existsSync(`${dbFile}.restore-journal.json`)).toBe(false);
});
