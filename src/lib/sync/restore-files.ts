import fs from "fs";

type RestoreJournal = { activePath: string; backupPath: string; stagePath: string; phase: "prepared" | "backup-moved" | "stage-moved" };

const journalPathFor = (activePath: string) => `${activePath}.restore-journal.json`;
const sidecars = (databasePath: string) => [`${databasePath}-wal`, `${databasePath}-shm`];

function writeDurableJson(filePath: string, value: RestoreJournal) {
  const descriptor = fs.openSync(filePath, "w");
  try {
    fs.writeFileSync(descriptor, JSON.stringify(value));
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
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
  if (fs.existsSync(journalPath)) fs.unlinkSync(journalPath);
}

/**
 * Conservative crash recovery: any unfinished swap restores the last known
 * good backup. It deliberately prefers data preservation over a half-verified
 * staging database.
 */
export function recoverInterruptedRestore(activePath: string) {
  const journalPath = journalPathFor(activePath);
  if (!fs.existsSync(journalPath)) return false;
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as RestoreJournal;
  if (journal.activePath !== activePath) throw new Error("Restore journal database path does not match the active database.");
  if (journal.phase === "prepared") {
    clearRestoreJournal(activePath);
    return true;
  }
  if (!fs.existsSync(journal.backupPath)) throw new Error("Interrupted restore backup is missing; refusing to start with an unknown database state.");
  if (fs.existsSync(activePath)) moveDatabaseFiles(activePath, `${journal.stagePath}.interrupted`);
  moveDatabaseFiles(journal.backupPath, activePath);
  cleanupDatabaseFiles(journal.stagePath);
  cleanupDatabaseFiles(`${journal.stagePath}.failed`);
  clearRestoreJournal(activePath);
  return true;
}
