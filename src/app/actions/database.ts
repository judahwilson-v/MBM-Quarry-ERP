"use server";

import fs from "fs";
import path from "path";
import { getDatabaseFilePath } from "@/lib/prisma";

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

export async function createLocalBackup() {
  try {
    const dbPath = getActiveDbPath();
    const backupDir = getBackupDir();

    if (!fs.existsSync(dbPath)) {
      throw new Error("Active database file not found");
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFilename = `quarry-backup-${timestamp}.bak`;
    const backupPath = path.join(backupDir, backupFilename);

    fs.copyFileSync(dbPath, backupPath);
    return { success: true, message: `Backup created: ${backupFilename}` };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export async function listLocalBackups() {
  try {
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

export async function restoreLocalBackup(filename: string) {
  try {
    const dbPath = getActiveDbPath();
    const backupDir = getBackupDir();

    const backupPath = path.join(backupDir, filename);
    if (!fs.existsSync(backupPath)) {
      throw new Error("Backup file not found");
    }

    fs.copyFileSync(backupPath, dbPath);
    return { success: true, message: "Database restored successfully. Please restart the application." };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}
