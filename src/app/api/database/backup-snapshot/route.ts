import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createConsistentSnapshotToFile } from '@/lib/backup-snapshot';
import { assertRestartNotRequired } from '@/lib/sync/restore-state';

export const dynamic = 'force-dynamic';

// FULL66: machine-authenticated consistent backup for the Electron shell.
//
// The shell previously copied raw bytes of the live database file
// (fs.copyFileSync), which can tear or corrupt when writes coincide - the same
// defect class FULL65 fixed for the export route. The shell has no user
// session, so this endpoint uses a per-boot machine credential instead:
//
//  - the shell generates a random token at spawn and passes it ONLY via the
//    child process environment (MBM_BACKUP_BOOT_TOKEN); it is never persisted
//    or logged;
//  - without that env var this endpoint is disabled entirely (404);
//  - the comparison is constant-time;
//  - the backup directory is fixed by the shell via MBM_BACKUP_DIR and the
//    filename is generated server-side; the client only supplies a short
//    sanitized prefix. No arbitrary path can be written;
//  - the restart barrier applies exactly as it does for export: while a
//    restart is required, no snapshot is taken (409);
//  - an existing destination is never overwritten;
//  - failure is loud and honest (false to the shell caller), never a silent
//    possibly-torn copy.

const PREFIX_PATTERN = /^[a-z0-9.-]{1,60}$/;

function tokenValid(req: NextRequest): boolean {
  const expected = process.env.MBM_BACKUP_BOOT_TOKEN;
  if (!expected) return false;
  const provided = req.headers.get('x-mbm-backup-token') || '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!process.env.MBM_BACKUP_BOOT_TOKEN || !process.env.MBM_BACKUP_DIR) {
    return NextResponse.json({ success: false, message: 'Not found.' }, { status: 404 });
  }
  try {
    assertRestartNotRequired();
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || 'Restart required.' }, { status: 409 });
  }
  if (!tokenValid(req)) {
    return NextResponse.json({ success: false, message: 'Not authorized.' }, { status: 403 });
  }
  let prefix = 'manual';
  try {
    const body = await req.json();
    if (body && typeof body.prefix === 'string') prefix = body.prefix;
  } catch { /* empty body uses the default prefix */ }
  if (!PREFIX_PATTERN.test(prefix) || prefix.includes("..")) {
    return NextResponse.json({ success: false, message: 'Invalid backup prefix.' }, { status: 400 });
  }

  const backupDir = path.resolve(process.env.MBM_BACKUP_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `MBM_Backup_${prefix}_${timestamp}.sqlite`;
  const destPath = path.resolve(backupDir, filename);
  if (!destPath.startsWith(backupDir + path.sep)) {
    return NextResponse.json({ success: false, message: 'Invalid backup path.' }, { status: 400 });
  }

  try {
    fs.mkdirSync(backupDir, { recursive: true });
    if (fs.existsSync(destPath)) {
      return NextResponse.json({ success: false, message: 'Backup already exists; refusing to overwrite.' }, { status: 409 });
    }
    await createConsistentSnapshotToFile(destPath);
    return NextResponse.json({ success: true, filename });
  } catch (error: any) {
    if (error?.message === 'Database not found.') {
      return NextResponse.json({ success: false, message: 'Database not found.' }, { status: 404 });
    }
    // FULL67 (carried 66 QA collision proof): exclusive-create refusal maps to
    // an honest 409; the existing file - including a concurrent winner's - is
    // never touched.
    if (error?.message === 'Backup destination already exists; refusing to overwrite.') {
      return NextResponse.json({ success: false, message: 'Backup already exists; refusing to overwrite.' }, { status: 409 });
    }
    console.error('Backup snapshot error:', error);
    return NextResponse.json({ success: false, message: 'Failed to create backup.' }, { status: 500 });
  }
}
