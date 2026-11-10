import { it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { copyFileSync } from 'node:fs';
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('@/lib/prisma',async(importOriginal)=>{const mod=await importOriginal<any>();return {...mod,getDb:async()=>state.db};});
import { createLocalBackup, listLocalBackups } from '../../src/app/actions/database';

// EVIDENCE PROBE, not a correctness proof. Corrected after QA source review: PrismaPromises
// are LAZY - an un-awaited create() never reaches the engine, so the earlier probe's claimed
// in-flight overlap never happened and its 8 "ok" trials showed only sequential copy integrity.
// Here each write is actually started (.then attached) and given one macrotask to reach the
// engine thread BEFORE the synchronous copy begins. Even so, a pass is NOT concurrency-safety
// proof: timing is best-effort and the copy window on a 4.6MB file is tiny.
const root = process.env.MBM_TEST_ROOT;
let dir: string; let dbFile: string;

beforeAll(() => {
  if (!root) throw Error('isolated fixture required');
  dir = `${root}/livecopy`; fs.mkdirSync(dir, { recursive: true });
  dbFile = `${dir}/active.db`;
  copyFileSync(`${root}/fixture.db`, dbFile);
  process.env.DATABASE_URL = `file:${dbFile}`;
});
afterAll(() => { delete process.env.DATABASE_URL; });

it('backup integrity gate: no successful backup may be corrupt under started-write pressure', async () => {
  const writer = new PrismaClient({ datasources: { db: { url: `file:${dbFile}` } } });
  state.db = writer; // backup uses the app's own connection: snapshot serializes behind started writes
  for (let i = 0; i < 200; i++) {
    await writer.auditLog.create({ data: { entityName: 'Probe', entityId: `inflate-${i}`, action: 'create', payload: 'x'.repeat(20000) } });
  }
  const sizeMB = (fs.statSync(dbFile).size / 1048576).toFixed(1);
  const outcomes: string[] = [];
  for (let trial = 0; trial < 8; trial++) {
    const executing = writer.auditLog.create({ data: { entityName: 'Probe', entityId: `trial-${trial}`, action: 'create', payload: 'y'.repeat(50000) } }).then(r => r); // .then STARTS the lazy query
    await new Promise(resolve => setImmediate(resolve)); // one macrotask so the engine thread picks it up
    const r = await createLocalBackup(); // synchronous copy while the write may be flushing
    await executing;
    expect(r.success).toBe(true);
    const name = (await listLocalBackups())[0].name;
    const reader = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, 'backups', name)}` } } });
    let integrity = 'unreadable';
    try {
      const rows: any[] = await reader.$queryRawUnsafe('PRAGMA integrity_check');
      integrity = rows?.[0]?.integrity_check ?? JSON.stringify(rows);
    } catch (e: any) { integrity = `OPEN FAILED: ${e.message}`; }
    await reader.$disconnect();
    outcomes.push(`trial ${trial}: ${integrity}`);
  }
  await writer.$disconnect();
  console.log(`LIVE-COPY PROBE(corrected) db=${sizeMB}MB :: ` + outcomes.join(' | '));
  const corrupt=outcomes.filter(o=>!o.endsWith(': ok'));
  expect(corrupt,'successful raw backups must never be corrupt: '+corrupt.join(' | ')).toEqual([]);
}, 60000);
