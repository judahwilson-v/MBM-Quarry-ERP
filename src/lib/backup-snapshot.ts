import fs from "fs";
import { randomUUID } from "crypto";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { getDatabaseFilePath } from "@/lib/prisma";

// FULL65: consistent snapshot of the live SQLite database for export.
//
// The export route previously served raw file bytes (fs.readFileSync of the
// live database file). With the app's actual journal mode (delete - no
// journal_mode is configured anywhere), a raw byte copy taken while a write
// commits can be corrupt or torn across a transaction boundary (reproduced in
// isolated synthetic characterization: index corruption, torn paired rows,
// unreadable copies). SQLite documents VACUUM INTO's output as "a consistent
// snapshot of the original database" (sqlite.org/lang_vacuum.html).
//
// Documented limits honored here:
//  - the destination must not already exist: a unique name is generated per
//    call and never reused or overwritten;
//  - VACUUM fails if the connection holds an open transaction or unfinalized
//    statements: a dedicated short-lived connection is used, separate from
//    the application's pooled client;
//  - an interrupted VACUUM INTO may leave an incomplete file: the snapshot is
//    written only to a unique .tmp sibling, read back only after the command
//    succeeds, and unlinked in every outcome;
//  - failure is honest: callers get a retryable message, never partial bytes.
//
// Notes on the snapshot's shape (logical content is a transaction-boundary
// snapshot of the live database): the copy is rebuilt - free pages are purged
// and ROWIDs of tables without an explicit INTEGER PRIMARY KEY may differ from
// the live file. Prisma models key on their own id columns, not rowid.
// While VACUUM INTO runs it holds a read transaction on the source; concurrent
// writers may briefly wait (bounded by the copy time), they are never torn.

// FULL67: residuals are HONEST and VISIBLE, never silently dropped and never
// force-deleted. A .snapshot-*.tmp file can only be removed safely by the
// operation that owns it; age does not prove ownership (a long or blocked
// export may still own its temp, and clocks lie), and process-start "quiescence"
// is not verified (an orphaned overlapping server can own a live temp). So:
//  - if the owning operation's own unlink fails, a sanitized warning is logged
//    naming the residual (no content, no credentials);
//  - every snapshot operation reports how many residuals are currently present
//    (sanitized notice), so the state is explicit instead of hidden;
//  - residuals are RETAINED until a positively-safe cleanup is designed.
//    Their names carry no data; their contents are a prior consistent snapshot.

function residualSnapshotTemps(dbPath: string): string[] {
  try {
    const dir = path.dirname(dbPath);
    const base = path.basename(dbPath) + ".snapshot-";
    return fs.readdirSync(dir).filter((f) => f.startsWith(base) && f.endsWith(".tmp"));
  } catch {
    return [];
  }
}

function warnResidualCleanupFailure(tmp: string, error: unknown) {
  const reason = error instanceof Error ? error.message : String(error);
  // Sanitized: path and OS reason only - never content, never credentials.
  console.error(`[BackupSnapshot] WARNING: snapshot temp cleanup failed; residual retained at ${tmp} (${reason}). Remove it only when no export or backup is in progress.`);
}

export async function createConsistentSnapshot(): Promise<ArrayBuffer> {
  const dbPath = getDatabaseFilePath();
  if (!fs.existsSync(dbPath)) {
    throw new Error("Database not found.");
  }
  const residuals = residualSnapshotTemps(dbPath);
  if (residuals.length > 0) {
    console.error(`[BackupSnapshot] notice: ${residuals.length} snapshot temp residual(s) present from earlier operations; retained (ownership cannot be proven safe to delete).`);
  }
  const tmp = `${dbPath}.snapshot-${randomUUID()}.tmp`;
  try {
    await createConsistentSnapshotToFile(tmp);
    const bytes = await fs.promises.readFile(tmp);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  } catch (error) {
    // FULL67 (carried from FULL66 QA): a failure reading the snapshot back must
    // surface the same sanitized retryable message as a snapshot failure;
    // raw FS/ORM diagnostics belong in the server log (cause), never public.
    if (error instanceof Error && error.message.startsWith("Could not produce a consistent database snapshot")) throw error;
    throw new Error("Could not produce a consistent database snapshot right now; please retry.", { cause: error });
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch (error) { warnResidualCleanupFailure(tmp, error); }
  }
}

// FULL66: same consistent snapshot, written directly to a caller-chosen
// destination (the shell backup flow). The destination must NOT already exist:
// VACUUM INTO refuses pre-existing files, and this function never overwrites.
export async function createConsistentSnapshotToFile(destPath: string): Promise<void> {
  const dbPath = getDatabaseFilePath();
  if (!fs.existsSync(dbPath)) {
    throw new Error("Database not found.");
  }
  // FULL67 (carried from FULL66 QA): ownership is established ATOMICALLY, not
  // by an existsSync precheck. An exclusive create (wx) proves WE created the
  // destination; only then may a later failure path remove it. A competing
  // creator's bytes are never deleted: EEXIST refuses honestly, and SQLite
  // documents that VACUUM INTO accepts a pre-existing EMPTY file.
  let fd: number;
  try {
    fd = fs.openSync(destPath, "wx");
  } catch (error: any) {
    if (error?.code === "EEXIST") {
      throw new Error("Backup destination already exists; refusing to overwrite.");
    }
    throw new Error("Could not produce a consistent database snapshot right now; please retry.", { cause: error });
  }
  fs.closeSync(fd);
  const client = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
  try {
    await client.$executeRawUnsafe("VACUUM INTO ?", destPath);
  } catch (error) {
    // destPath is provably ours (exclusive create above): removal is safe.
    // If even that removal fails, say so (residual retained honestly, see
    // the FULL67 note above).
    try { fs.rmSync(destPath, { force: true }); } catch (rmError) { warnResidualCleanupFailure(destPath, rmError); }
    throw new Error("Could not produce a consistent database snapshot right now; please retry.", { cause: error });
  } finally {
    await client.$disconnect().catch(() => { /* closing */ });
  }
}
