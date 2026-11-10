import { NextRequest, NextResponse } from 'next/server';
import { createConsistentSnapshot } from '@/lib/backup-snapshot';
import { requireControlActor } from '@/lib/identity/control';
import { assertRestartNotRequired } from '@/lib/sync/restore-state';

export const dynamic = 'force-dynamic';

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

export async function GET(req: NextRequest) {
  try {
    assertRestartNotRequired();
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || 'Restart required.' }, { status: 409 });
  }
  try {
    await requireControlActor(bearerToken(req));
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || 'Not authorized.' }, { status: 403 });
  }
  // Exporting downloads the ENTIRE database, including every business record.
  // It is gated by the same control-plane boundary as restore: once
  // enrollment is complete, only the configured owner-authorized principal
  // with a valid session may export.
  // A completed database-file replacement invalidates every in-process view
  // of the data until restart. This route reads the file directly, so it must
  // consult the restart barrier itself - the gated query client cannot cover
  // a raw file read.
  try {
    // FULL65: serve a consistent transaction-boundary snapshot (VACUUM INTO),
    // never raw bytes of the live file, which can tear under concurrent writes.
    const snapshot = await createConsistentSnapshot();

    return new NextResponse(snapshot, {
      headers: {
        'Content-Disposition': 'attachment; filename="quarry-export.db"',
        'Content-Type': 'application/octet-stream',
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return new NextResponse("Failed to export database", { status: 500 });
  }
}
