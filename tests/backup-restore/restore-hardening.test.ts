// Restore-hardening contract (FULL36): atomic journal, moving-active phase ordering,
// crash recovery at each durable journal phase. Markers are neutral strings.
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import { copyFileSync } from 'node:fs';
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('@/lib/prisma',async(importOriginal)=>{const mod=await importOriginal<any>();return {...mod,getDb:async()=>state.db};});
import { createLocalBackup, restoreLocalBackup, listLocalBackups } from '../../src/app/actions/database';
import { clearRestartRequiredForProcessStart } from '../../src/lib/sync/restore-state';
import { startRestoreJournal, updateRestoreJournal, recoverInterruptedRestore } from '../../src/lib/sync/restore-files';

let dir: string; let dbFile: string; let n = 0;
const root = process.env.MBM_TEST_ROOT;
beforeEach(() => {
  if (!root) throw Error('isolated fixture required');
  clearRestartRequiredForProcessStart();
  dir = `${root}/hardening-${++n}`; fs.mkdirSync(dir, { recursive: true });
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
const journalOf = (f: string) => `${f}.restore-journal.json`;

it('crash during active move (durable moving-active) recovers the ORIGINAL database', async () => {
  await marker('marker-alpha');
  const pre = `${dbFile}.pre-restore-h1.bak`; const stage = `${dbFile}.restore-stage`;
  startRestoreJournal(dbFile, pre, stage);
  fs.copyFileSync(dbFile, stage);                 // staged before any active rename (new order)
  updateRestoreJournal(dbFile, 'moving-active');  // durable record before the first rename
  fs.renameSync(dbFile, pre);                     // crash window: backup-moved never reached
  expect(recoverInterruptedRestore(dbFile)).toBe(true);
  expect(await markerIn(dbFile)).toBe('marker-alpha');
  expect(fs.existsSync(stage)).toBe(false);
  expect(fs.existsSync(journalOf(dbFile))).toBe(false);
});

it('crash between moving-active record and first rename keeps the untouched original', async () => {
  await marker('marker-alpha');
  const pre = `${dbFile}.pre-restore-h2.bak`; const stage = `${dbFile}.restore-stage`;
  startRestoreJournal(dbFile, pre, stage);
  fs.copyFileSync(dbFile, stage);
  updateRestoreJournal(dbFile, 'moving-active');
  expect(recoverInterruptedRestore(dbFile)).toBe(true); // no rename ever happened
  expect(await markerIn(dbFile)).toBe('marker-alpha');
  expect(fs.existsSync(journalOf(dbFile))).toBe(false);
});

it('moving-active with BOTH active and aside copies missing fails closed and preserves the journal', async () => {
  const pre = `${dbFile}.pre-restore-h3.bak`;
  startRestoreJournal(dbFile, pre, `${dbFile}.restore-stage`);
  updateRestoreJournal(dbFile, 'moving-active');
  fs.rmSync(dbFile);
  expect(() => recoverInterruptedRestore(dbFile)).toThrow(/missing/i);
  expect(fs.existsSync(journalOf(dbFile))).toBe(true); // preserved for manual recovery
});

it('journal write fault leaves the LAST DURABLE journal intact - never truncated', async () => {
  await marker('marker-alpha');
  const pre = `${dbFile}.pre-restore-h4.bak`;
  startRestoreJournal(dbFile, pre, `${dbFile}.restore-stage`);
  const original = fs.writeFileSync; let writes = 0;
  vi.spyOn(fs, 'writeFileSync').mockImplementation(((file: any, ...args: any[]) => {
    if (typeof file === 'number' && ++writes === 1) throw Error('synthetic journal write failure');
    return (original as any)(file, ...args);
  }) as any);
  expect(() => updateRestoreJournal(dbFile, 'moving-active')).toThrow();
  vi.restoreAllMocks();
  const j = JSON.parse(fs.readFileSync(journalOf(dbFile), 'utf8'));
  expect(j.phase).toBe('prepared'); // intact, not empty
  expect(recoverInterruptedRestore(dbFile)).toBe(true);
  expect(await markerIn(dbFile)).toBe('marker-alpha');
});

it('orphan journal temp from an interrupted atomic write is cleaned and never parsed', async () => {
  await marker('marker-alpha');
  startRestoreJournal(dbFile, `${dbFile}.pre-restore-h5.bak`, `${dbFile}.restore-stage`);
  fs.writeFileSync(`${journalOf(dbFile)}.tmp`, '{"partial-json');
  expect(recoverInterruptedRestore(dbFile)).toBe(true);
  expect(fs.existsSync(`${journalOf(dbFile)}.tmp`)).toBe(false);
  expect(await markerIn(dbFile)).toBe('marker-alpha');
});

it('unreadable journal fails closed and is preserved', async () => {
  startRestoreJournal(dbFile, `${dbFile}.pre-restore-h6.bak`, `${dbFile}.restore-stage`);
  fs.writeFileSync(journalOf(dbFile), 'not-json{');
  expect(() => recoverInterruptedRestore(dbFile)).toThrow(/unreadable/i);
  expect(fs.existsSync(journalOf(dbFile))).toBe(true);
});

it('injected journal fault at moving-active update: restore fails with active UNTOUCHED', async () => {
  await marker('marker-alpha');
  expect((await createLocalBackup()).success).toBe(true);
  const name = (await listLocalBackups())[0].name;
  const original = fs.openSync; let journalOpens = 0;
  vi.spyOn(fs, 'openSync').mockImplementation(((file: any, ...args: any[]) => {
    if (String(file).endsWith('.restore-journal.json.tmp') && ++journalOpens === 2) throw new Error('synthetic journal update open failure');
    return (original as any)(file, ...args);
  }) as any);
  const result = await restoreLocalBackup(name);
  vi.restoreAllMocks();
  expect(result.success).toBe(false);
  expect(await markerIn(dbFile)).toBe('marker-alpha'); // active never renamed
  expect(recoverInterruptedRestore(dbFile)).toBe(true); // prepared cleanup
  expect(fs.existsSync(journalOf(dbFile))).toBe(false);
  expect(fs.existsSync(`${dbFile}.restore-stage`)).toBe(false);
});

it('injected journal fault AFTER active rename (backup-moved update): recovery restores the original', async () => {
  await marker('marker-alpha');
  expect((await createLocalBackup()).success).toBe(true);
  const name = (await listLocalBackups())[0].name;
  const original = fs.openSync; let journalOpens = 0;
  vi.spyOn(fs, 'openSync').mockImplementation(((file: any, ...args: any[]) => {
    if (String(file).endsWith('.restore-journal.json.tmp') && ++journalOpens === 3) throw new Error('synthetic journal update open failure');
    return (original as any)(file, ...args);
  }) as any);
  const result = await restoreLocalBackup(name);
  vi.restoreAllMocks();
  expect(result.success).toBe(false);
  expect(fs.existsSync(dbFile)).toBe(false);            // active aside at this crash point
  expect(recoverInterruptedRestore(dbFile)).toBe(true); // moving-active rollback
  expect(await markerIn(dbFile)).toBe('marker-alpha');  // ORIGINAL RESTORED
  expect(fs.existsSync(journalOf(dbFile))).toBe(false);
});
