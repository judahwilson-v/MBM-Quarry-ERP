"use server";

import fs from "fs";
import path from "path";
import { getDb, getDatabaseFilePath, disconnectDatabase } from "@/lib/prisma";
import { PrismaClient } from "@prisma/client";
import { abandonRestartIntent, beginRestartIntent, beginRestore, endRestore, finalizeRestartIntent } from "@/lib/sync/restore-state";
import { startRestoreJournal, updateRestoreJournal, clearRestoreJournal, moveDatabaseFiles, cleanupDatabaseFiles } from "@/lib/sync/restore-files";
import { sanitizeError } from "@/lib/utils/sanitize-error";
import { requireControlActor } from "@/lib/identity/control";
import { snapshotIdentity, hasIdentityRows, isEnrolledSnapshot, applyIdentitySnapshot } from "@/lib/identity/preserve";

function getActiveDbPath() {
  return getDatabaseFilePath();
}

function getBackupDir() {
  const dbPath = getActiveDbPath();
  const dir = path.join(path.dirname(dbPath), "backups");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export async function createLocalBackup(sessionToken?: string | null) {
  try {
    await requireControlActor(sessionToken);
    const dbPath = getActiveDbPath();
    const backupDir = getBackupDir();

    if (!fs.existsSync(dbPath)) {
      throw new Error("Active database file not found");
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFilename = `quarry-backup-${timestamp}.bak`;
    const backupPath = path.join(backupDir, backupFilename);

    // Consistent snapshot through the app's own connection, never a raw file copy:
    // copyFileSync of the live SQLite file under concurrent writes was reproduced
    // producing malformed backup images. VACUUM INTO runs under SQLite locking on the
    // same connection the app writes through, so the backup is always a complete
    // snapshot as of a committed state (or a clean failure, never silent corruption).
    const db = await getDb();
    await db.$executeRawUnsafe(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    return { success: true, message: `Backup created: ${backupFilename}` };
  } catch (error: any) {
    return { success: false, message: sanitizeError(error) };
  }
}

export async function listLocalBackups(sessionToken?: string | null) {
  try {
    await requireControlActor(sessionToken);
    const backupDir = getBackupDir();
    if (!fs.existsSync(backupDir)) return [];
    
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.bak'));
    
    return files.map(f => {
      const stats = fs.statSync(path.join(backupDir, f));
      return {
        name: f,
        size: stats.size,
        createdAt: stats.mtime
      };
    }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch {
    return [];
  }
}

export async function restoreLocalBackup(filename: string, sessionToken?: string | null) {
  try {
    // Control gate first: restoring replaces the entire database, so it
    // requires the configured owner-authorized principal once enrollment is
    // complete (or setup compatibility mode before enrollment exists).
    await requireControlActor(sessionToken);
    const dbPath = getActiveDbPath();
    const backupDir = getBackupDir();

    // Allowed backup-name contract: a plain ".bak" basename only. Anything with path
    // separators, traversal segments, or a non-.bak extension is refused before any
    // file is read or written - restore must never reach outside the backups dir.
    if (typeof filename !== "string" || !filename.endsWith(".bak") || filename !== path.basename(filename)) {
      throw new Error("Invalid backup file name");
    }
    const backupPath = path.join(backupDir, filename);
    if (path.dirname(backupPath) !== backupDir) {
      throw new Error("Invalid backup file name");
    }
    // Physical containment: refuse when the backups DIRECTORY itself resolves elsewhere
    // (a symlinked backups dir means restore pulls bytes from another location), and when
    // the candidate file resolves outside the real backups dir (a planted ".bak" symlink).
    // Trade-off: an install whose whole path traverses symlinks cannot restore - fail closed.
    const realDir = fs.realpathSync(backupDir);
    if (realDir !== path.resolve(backupDir)) {
      throw new Error("Invalid backup location");
    }
    if (fs.existsSync(backupPath)) {
      const realTarget = fs.realpathSync(backupPath);
      if (path.dirname(realTarget) !== realDir) {
        throw new Error("Invalid backup file name");
      }
    }
    if (!fs.existsSync(backupPath)) {
      throw new Error("Backup file not found");
    }

    // Validate BEFORE any swap: the candidate must open as a clean SQLite image.
    // A malformed backup is refused here with zero writes to the active database.
    const validator = new PrismaClient({ datasources: { db: { url: `file:${backupPath}` } } });
    let backupHasIdentity = false;
    try {
      const rows = (await validator.$queryRawUnsafe("PRAGMA integrity_check")) as any[];
      if (rows?.[0]?.integrity_check !== "ok") throw new Error("not clean");
      backupHasIdentity = await hasIdentityRows(validator);
    } catch {
      await validator.$disconnect().catch(() => {});
      throw new Error("Backup file is not a valid database");
    }
    await validator.$disconnect();

    // Device identity policy, decided BEFORE any file is touched. The current
    // device's identity state (users, sessions, enrollment) always wins over
    // whatever a backup carries:
    // - Enrolled device: the current identity snapshot is re-applied onto the
    //   restored database after the swap, so a restore can never resurrect
    //   revoked sessions, re-activate deactivated users, or reopen enrollment.
    // - Unenrolled device + a backup that carries identity rows: refused.
    //   Importing credentials from a backup would need an owner-authorized
    //   enrollment policy that does not exist, so this fails closed rather
    //   than guessing a migration.
    const identitySnapshot = await snapshotIdentity(await getDb());
    const preserveIdentity = isEnrolledSnapshot(identitySnapshot);
    if (!preserveIdentity && backupHasIdentity) {
      throw new Error("Restore refused: this backup contains device login data, but this install has not completed enrollment. Restoring it would import credentials without an owner-authorized policy.");
    }

    // Journaled swap reusing the app's staged-restore invariants: refuse concurrent restores,
    // disconnect the active connection, journal phases, move current aside, stage the validated
    // backup in, reopen-check, roll back to the pre-restore copy on any failure. Crash recovery
    // stays conservative via recoverInterruptedRestore (preserves the last known good copy).
    // Ordering invariant: the staged copy is complete and the moving-active record is durable
    // BEFORE the first active rename, so no journal-write fault can strand the active database.
    const restoreToken = beginRestore();
    if (!restoreToken) throw new Error("A restore is already in progress");
    // FULL58: persist the durable restart intent BEFORE anything touches the
    // active database file. If the marker cannot be written, abort here with
    // the database untouched - a completed swap must never exist without its
    // durable barrier (FULL57 marker-IO fault: restore succeeded while the
    // marker write failed, leaving cross-route queries unguarded).
    let intentToken: string;
    try {
      intentToken = beginRestartIntent();
    } catch (intentError) {
      endRestore();
      return { success: false, message: "Could not prepare the restore safely. The database was not changed. Restart the application and try again." };
    }
    const preRestorePath = `${dbPath}.pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
    const stagePath = `${dbPath}.restore-stage`;
    try {
      await disconnectDatabase();
      startRestoreJournal(dbPath, preRestorePath, stagePath);
      try {
        fs.copyFileSync(backupPath, stagePath);
      } catch (stageError) {
        // Staging failed before any active file was touched: clean up and fail.
        cleanupDatabaseFiles(stagePath);
        clearRestoreJournal(dbPath);
        abandonRestartIntent(intentToken);
        throw stageError;
      }
      updateRestoreJournal(dbPath, "moving-active");
      moveDatabaseFiles(dbPath, preRestorePath);
      updateRestoreJournal(dbPath, "backup-moved");
      try {
        moveDatabaseFiles(stagePath, dbPath);
        updateRestoreJournal(dbPath, "stage-moved");
        if (preserveIdentity) {
          // Re-apply the device's identity snapshot onto the restored image.
          // Runs inside the journaled phase: any failure here takes the
          // rollback path and brings the pre-restore database back.
          const restored = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
          try {
            await applyIdentitySnapshot(restored, identitySnapshot);
          } finally {
            await restored.$disconnect().catch(() => {});
          }
        }
        const probe = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
        try {
          const rows = (await probe.$queryRawUnsafe("PRAGMA integrity_check")) as any[];
          if (rows?.[0]?.integrity_check !== "ok") throw new Error("restored database failed integrity check");
        } finally {
          await probe.$disconnect().catch(() => {});
        }
        // Commit the intent marker as the durable barrier. If the marker cannot
        // be finalized the swap is NOT considered successful: the catch below
        // rolls the pre-restore database back and abandons our intent.
        finalizeRestartIntent(intentToken);
        clearRestoreJournal(dbPath);
        return { success: true, message: "Database restored successfully. Please restart the application." };
      } catch (swapError) {
        if (fs.existsSync(dbPath)) moveDatabaseFiles(dbPath, `${stagePath}.failed`);
        moveDatabaseFiles(preRestorePath, dbPath);
        clearRestoreJournal(dbPath);
        // Rollback completed (or failed loudly above): the original database is
        // back in place, so OUR intent marker is released. A removal failure
        // stays fail-closed (barrier remains, restart required) rather than
        // leaving a restored-original database unguarded in doubt.
        abandonRestartIntent(intentToken);
        throw swapError;
      }
    } finally {
      endRestore();
    }
  } catch (error: any) {
    return { success: false, message: sanitizeError(error) };
  }
}
