import fs from "fs";
import path from "path";

// Journal phases, in durable order:
//   prepared      - journal written, staging may begin; NO active file has been renamed
//   moving-active - durable record written BEFORE the first active rename; the active
//                   files may be split between the active path and the aside path
//   backup-moved  - active files fully aside; staged files may be partially moved in
//   stage-moved   - staged files fully in place; probe/journal-clear still pending
// A crash is only ever observed at one of these durable records, because each phase
// transition is published BEFORE the file operations it describes.
type RestoreJournal = { activePath: string; backupPath: string; stagePath: string; phase: "prepared" | "moving-active" | "backup-moved" | "stage-moved" };

const journalPathFor = (activePath: string) => `${activePath}.restore-journal.json`;
const sidecars = (databasePath: string) => [`${databasePath}-wal`, `${databasePath}-shm`];

function writeDurableJson(filePath: string, value: RestoreJournal) {
  // Atomic publish: write + fsync a temp sibling, then rename over the journal.
  // A failed or interrupted write leaves the LAST durable journal intact - the
  // journal file is never opened with "w", so it can never be truncated empty.
  const tempPath = `${filePath}.tmp`;
  const descriptor = fs.openSync(tempPath, "w");
  try {
    fs.writeFileSync(descriptor, JSON.stringify(value));
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(tempPath, filePath);
  try {
    // Best-effort directory durability after the atomic rename. A failure here
    // does not affect the rename's atomicity; power-loss durability is not claimed.
    const dir = fs.openSync(path.dirname(filePath), "r");
    try {
      fs.fsyncSync(dir);
    } finally {
      fs.closeSync(dir);
    }
  } catch {}
}

export function moveDatabaseFiles(from: string, to: string) {
  if (fs.existsSync(from)) fs.renameSync(from, to);
  for (const fromSidecar of sidecars(from)) {
    if (fs.existsSync(fromSidecar)) fs.renameSync(fromSidecar, `${to}${fromSidecar.slice(from.length)}`);
  }
}

export function cleanupDatabaseFiles(databasePath: string) {
  for (const candidate of [databasePath, ...sidecars(databasePath)]) {
    if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
  }
}

export function startRestoreJournal(activePath: string, backupPath: string, stagePath: string) {
  writeDurableJson(journalPathFor(activePath), { activePath, backupPath, stagePath, phase: "prepared" });
}

export function updateRestoreJournal(activePath: string, phase: RestoreJournal["phase"]) {
  const journalPath = journalPathFor(activePath);
  const current = JSON.parse(fs.readFileSync(journalPath, "utf8")) as RestoreJournal;
  writeDurableJson(journalPath, { ...current, phase });
}

export function clearRestoreJournal(activePath: string) {
  const journalPath = journalPathFor(activePath);
  if (fs.existsSync(`${journalPath}.tmp`)) fs.unlinkSync(`${journalPath}.tmp`);
  if (fs.existsSync(journalPath)) fs.unlinkSync(journalPath);
}

/**
 * Conservative crash recovery: any unfinished swap restores the last known
 * good backup. It deliberately prefers data preservation over a half-verified
 * staging database. Tested against process-crash windows at each durable
 * journal phase; power-loss, partial I/O and hostile-filesystem races remain
 * outside the tested bound.
 */
export function recoverInterruptedRestore(activePath: string) {
  const journalPath = journalPathFor(activePath);
  // An orphan temp is the leftover of an interrupted atomic write; it is never
  // the journal itself and must not be parsed or survive recovery.
  if (fs.existsSync(`${journalPath}.tmp`)) fs.unlinkSync(`${journalPath}.tmp`);
  if (!fs.existsSync(journalPath)) return false;
  let journal: RestoreJournal;
  try {
    journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as RestoreJournal;
  } catch {
    // Fail closed: an unreadable journal means the active database state is
    // unknown. Refuse to start rather than bootstrap over stranded data; the
    // journal is preserved for manual recovery.
    throw new Error("Restore journal is unreadable; refusing to start with an unknown database state.");
  }
  if (journal.activePath !== activePath) throw new Error("Restore journal database path does not match the active database.");
  if (journal.phase === "prepared") {
    // 'prepared' is durable only while no active file has been renamed (the
    // moving-active record is published first), so the active database is intact.
    cleanupDatabaseFiles(journal.stagePath);
    clearRestoreJournal(activePath);
    return true;
  }
  if (journal.phase === "moving-active") {
    // Crash between the durable moving-active record and the backup-moved record:
    // active files may be split between the active path and the aside path.
    if (!fs.existsSync(journal.backupPath)) {
      if (fs.existsSync(activePath)) {
        // The rename never started (journal written, no file moved).
        cleanupDatabaseFiles(journal.stagePath);
        clearRestoreJournal(activePath);
        return true;
      }
      throw new Error("Interrupted restore backup is missing; refusing to start with an unknown database state.");
    }
    // Per-file rollback: renames each moved file back over its original path;
    // files never moved are untouched. The original set is reassembled.
    moveDatabaseFiles(journal.backupPath, activePath);
    cleanupDatabaseFiles(journal.stagePath);
    clearRestoreJournal(activePath);
    return true;
  }
  // backup-moved / stage-moved: the active files are fully aside; roll back to
  // the last known good copy and discard whatever was staged in.
  if (!fs.existsSync(journal.backupPath)) throw new Error("Interrupted restore backup is missing; refusing to start with an unknown database state.");
  if (fs.existsSync(activePath)) moveDatabaseFiles(activePath, `${journal.stagePath}.interrupted`);
  moveDatabaseFiles(journal.backupPath, activePath);
  cleanupDatabaseFiles(journal.stagePath);
  cleanupDatabaseFiles(`${journal.stagePath}.failed`);
  clearRestoreJournal(activePath);
  return true;
}
