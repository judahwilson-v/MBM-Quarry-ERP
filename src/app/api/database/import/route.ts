import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDatabaseFilePath } from '@/lib/prisma';
import { requireControlActor } from '@/lib/identity/control';
import { assertRestartNotRequired } from '@/lib/sync/restore-state';
import { restoreLocalBackup } from '@/app/actions/database';

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  // Barrier first: restart-required is a process state, and after a restore
  // the replaced database file cannot answer the control check anyway.
  try {
    assertRestartNotRequired();
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || 'Restart required.' }, { status: 409 });
  }
  try {
    await requireControlActor(token);
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || 'Not authorized.' }, { status: 403 });
  }
  // Importing after a completed restore but before restart would stack a
  // second replacement on top of an un-restarted process; the barrier above
  // refuses it like the gated query layer does.
  try {
    const formData = await req.formData();
    const file = formData.get('database') as File;

    if (!file) {
      return new NextResponse("No database file uploaded", { status: 400 });
    }

    // The upload is staged as an ordinary local backup and then restored
    // through the SAME validated, journaled and identity-preserving path as
    // restoreLocalBackup. Previously this route overwrote the live database
    // file directly - no integrity validation, no journal, no rollback, and
    // no identity preservation.
    const dbPath = getDatabaseFilePath();
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const name = `quarry-upload-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(path.join(backupDir, name), buffer);

    const result = await restoreLocalBackup(name, token);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error("Import error:", error);
    return new NextResponse("Failed to import database", { status: 500 });
  }
}
