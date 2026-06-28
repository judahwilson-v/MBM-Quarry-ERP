import fs from 'fs';
import path from 'path';
import { getDatabaseFilePath } from './prisma';
import { app } from 'electron'; // Only safe to call if we check process.type

/**
 * Gets the backup directory for MBM Quarry ERP.
 * Resolves to ~/Documents/MBM-Backups on the user's machine.
 */
export function getBackupDirectory(): string {
  // Try to use electron's app.getPath if we are in an electron environment
  let documentsPath = '';
  
  try {
    if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
      // We are in the Electron main process
      documentsPath = require('electron').app.getPath('documents');
    } else {
      // We might be in Next.js server, which doesn't have direct access to 'app'
      // but we can construct the path from HOME / USERPROFILE
      documentsPath = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Documents');
    }
  } catch (err) {
    documentsPath = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Documents');
  }

  const backupDir = path.join(documentsPath, 'MBM-Backups');
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  return backupDir;
}

/**
 * Creates a backup of the current SQLite database.
 * @param prefix E.g. 'daily', 'pre-update', 'manual'
 * @returns The path to the created backup file
 */
export async function createDatabaseBackup(prefix: string = 'manual'): Promise<string> {
  const dbPath = getDatabaseFilePath();
  
  if (!fs.existsSync(dbPath)) {
    throw new Error('Database file does not exist, cannot backup.');
  }

  const backupDir = getBackupDirectory();
  
  // Format: MBM_Backup_daily_2026-06-28T14-30-00.sqlite
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilename = `MBM_Backup_${prefix}_${timestamp}.sqlite`;
  const backupPath = path.join(backupDir, backupFilename);

  // Perform the copy
  await fs.promises.copyFile(dbPath, backupPath);
  
  return backupPath;
}

/**
 * Enforces retention policy. Keeps the newest N backups and deletes the rest.
 * @param maxBackupsToKeep default 30
 */
export async function cleanupOldBackups(maxBackupsToKeep: number = 30) {
  try {
    const backupDir = getBackupDirectory();
    const files = await fs.promises.readdir(backupDir);
    
    // Filter only sqlite backups
    const backupFiles = files
      .filter(f => f.startsWith('MBM_Backup_') && f.endsWith('.sqlite'))
      .map(f => ({
        name: f,
        path: path.join(backupDir, f),
        stat: fs.statSync(path.join(backupDir, f))
      }));
      
    // Sort by modification time, newest first
    backupFiles.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    
    // Delete files beyond the max limit
    if (backupFiles.length > maxBackupsToKeep) {
      const filesToDelete = backupFiles.slice(maxBackupsToKeep);
      for (const file of filesToDelete) {
        await fs.promises.unlink(file.path);
        console.log(`Deleted old backup: ${file.name}`);
      }
    }
  } catch (err) {
    console.error('Failed to cleanup old backups:', err);
  }
}

/**
 * Helper to check if a daily backup was already created today.
 */
export async function ensureDailyBackup() {
  try {
    const backupDir = getBackupDirectory();
    const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    const files = await fs.promises.readdir(backupDir);
    const hasTodayBackup = files.some(f => f.startsWith(`MBM_Backup_daily_${todayStr}`));
    
    if (!hasTodayBackup) {
      console.log('No daily backup found for today. Creating one...');
      await createDatabaseBackup('daily');
      await cleanupOldBackups(30); // Clean up after creating new one
    }
  } catch (err) {
    console.error('Failed to ensure daily backup:', err);
  }
}
