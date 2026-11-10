import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { copyFileSync } from 'node:fs';
// DATABASE_URL is read by getDatabaseFilePath() at call time, so each test points the
// backup actions at its own synthetic SQLite copy. The app DB is never touched.
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('@/lib/prisma',async(importOriginal)=>{const mod=await importOriginal<any>();return {...mod,getDb:async()=>state.db};});
import { createLocalBackup, listLocalBackups, restoreLocalBackup } from '../../src/app/actions/database';

let dir: string;
let dbFile: string;
let n = 0;
const root = process.env.MBM_TEST_ROOT;

function freshDb() {
  n++;
  dir = `${root}/backup-${n}`;
  fs.mkdirSync(dir, { recursive: true });
  dbFile = `${dir}/active.db`;
  copyFileSync(`${root}/fixture.db`, dbFile);
  process.env.DATABASE_URL = `file:${dbFile}`;
  state.db = new PrismaClient({ datasources: { db: { url: `file:${dbFile}` } } });
}

beforeEach(() => {
  if (!root) throw Error('isolated fixture required');
  freshDb();
});
afterEach(async () => { await state.db.$disconnect(); delete process.env.DATABASE_URL; });

it('createLocalBackup writes a complete valid .bak beside the DB and lists it newest-first', async () => {
  await state.db.globalSettings.create({ data: { id: 'default', quarryName: 'marker-alpha' } });
  const r1 = await createLocalBackup();
  expect(r1.success).toBe(true);
  const r2 = await createLocalBackup();
  expect(r2.success).toBe(true);
  const list = await listLocalBackups();
  expect(list.length).toBe(2);
  expect(list[0].createdAt.getTime()).toBeGreaterThanOrEqual(list[1].createdAt.getTime());
  // Snapshot backups are consistent, not byte-identical (VACUUM INTO rebuilds the image):
  // the backup must open cleanly, pass integrity_check, and carry the same rows.
  const backupPath = path.join(dir, 'backups', list[0].name);
  const reader = new PrismaClient({ datasources: { db: { url: `file:${backupPath}` } } });
  const integrity: any[] = await reader.$queryRawUnsafe('PRAGMA integrity_check');
  expect(integrity[0].integrity_check).toBe('ok');
  expect((await reader.globalSettings.findUnique({ where: { id: 'default' } }))?.quarryName).toBe('marker-alpha');
  await reader.$disconnect();
});

it('restore round-trip recovers pre-backup rows after destructive mutation (restart semantics)', async () => {
  await state.db.globalSettings.create({ data: { id: 'default', quarryName: 'marker-alpha' } });
  expect((await createLocalBackup()).success).toBe(true);
  const name = (await listLocalBackups())[0].name;

  await state.db.globalSettings.delete({ where: { id: 'default' } });

  expect((await restoreLocalBackup(name)).success).toBe(true);
  // Post-restore reads use a FRESH connection (restart semantics); the pre-restore
  // connection is barred from continuing by the restart barrier.
  const fresh = new PrismaClient({ datasources: { db: { url: `file:${dbFile}` } } });
  const restored = await fresh.globalSettings.findUnique({ where: { id: 'default' } });
  await fresh.$disconnect();
  expect(restored?.quarryName).toBe('marker-alpha');
});

it('createLocalBackup fails closed with a sanitized message when the DB file is missing', async () => {
  fs.rmSync(dbFile);
  const r = await createLocalBackup();
  expect(r.success).toBe(false);
  expect(r.message).not.toMatch(/\/tmp|node_modules|\.db/); // no path/internals leak
});

// Bounded restore-name contract (failing-first against FULL31 behavior):
// allowed = a plain .bak basename; anything with path separators, traversal, absolute
// paths, or a non-.bak extension is refused before any file is read or written.
// Each disallowed name is backed by a REAL file at its resolved location, so an
// unguarded restore would happily copy it onto the DB - refusal must be explicit.
it.each([
  '../../planted-outside.bak',
  '../planted-one-up.bak',
  '/etc/passwd',
  'planted-wrong-ext.db',
  'nested/planted.bak',
])('restore refuses disallowed backup name %j without touching the DB', async (name) => {
  const backupsDir = path.join(dir, 'backups');
  const resolved = path.resolve(backupsDir, name);
  if (!name.startsWith('/')) { fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, 'synthetic-planted-payload'); }
  const before = fs.readFileSync(dbFile);
  const r = await restoreLocalBackup(name);
  expect(r.success).toBe(false);
  expect(fs.readFileSync(dbFile)).toEqual(before); // zero write on refusal
});
it('restore still accepts a plain .bak basename from the backups dir', async () => {
  expect((await createLocalBackup()).success).toBe(true);
  const name = (await listLocalBackups())[0].name;
  expect(name.endsWith('.bak')).toBe(true);
  expect((await restoreLocalBackup(name)).success).toBe(true);
});

// Link edge case: a .bak name that passes the string contract but is a SYMLINK inside the
// backups dir pointing outside it. Restore resolves links for reading, so name checks alone
// still reach outside. Containment must hold after link resolution, not only on the string.
it('restore refuses a backups-dir symlink that resolves outside the dir', async () => {
  const outside = `${root}/link-target.bak`;
  fs.writeFileSync(outside, 'synthetic-linked-payload');
  const backupsDir = path.join(dir, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  fs.symlinkSync(outside, path.join(backupsDir, 'linked.bak'));
  const before = fs.readFileSync(dbFile);
  const r = await restoreLocalBackup('linked.bak');
  expect(r.success).toBe(false);
  expect(fs.readFileSync(dbFile)).toEqual(before);
});

it('restore refuses when the backups DIRECTORY itself is a symlink elsewhere', async () => {
  const realBackups = path.join(dir, 'backups');
  fs.mkdirSync(realBackups, { recursive: true });
  const donor = `${root}/donor-dir`; fs.mkdirSync(donor, { recursive: true });
  fs.writeFileSync(path.join(donor, 'donor.bak'), 'synthetic-donor-payload');
  fs.renameSync(realBackups, `${dir}/backups-real`);
  fs.symlinkSync(donor, realBackups);
  const before = fs.readFileSync(dbFile);
  const r = await restoreLocalBackup('donor.bak');
  expect(r.success).toBe(false);
  expect(fs.readFileSync(dbFile)).toEqual(before);
});
