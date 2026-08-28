import path from "path";
import { PrismaClient } from "@prisma/client";
import { initializeDatabase } from "./bootstrap";
import { assertRestoreIsNotInProgress } from "./sync/restore-state";
import { recoverInterruptedRestore } from "./sync/restore-files";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  databaseReady?: Promise<void>;
};

// Resolve the database URL.
// In production (Electron packaged), desktop/main.js sets DATABASE_URL
// to an absolute path in the user's appData directory.
// In development, we resolve relative to the project root.
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const dbPath = path.resolve(process.cwd(), "prisma", "local.db");
  return `file:${dbPath}`;
}

// Helper to extract the filesystem path from a DATABASE_URL.
// Handles: "file:./local.db", "file:/abs/path", "file:C:\path", "./relative"
export function getDatabaseFilePath(): string {
  const dbUrl = process.env.DATABASE_URL || `file:${path.resolve(process.cwd(), "prisma", "local.db")}`;
  return dbUrl.replace(/^file:/, "");
}

export function getPrisma() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      datasources: { db: { url: resolveDatabaseUrl() } },
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }

  return globalForPrisma.prisma;
}

export async function ensureDatabase() {
  if (!globalForPrisma.databaseReady) {
    globalForPrisma.databaseReady = (async () => {
      recoverInterruptedRestore(getDatabaseFilePath());
      await initializeDatabase(getPrisma());
    })();
  }

  return globalForPrisma.databaseReady;
}

export async function getDb() {
  assertRestoreIsNotInProgress();
  await ensureDatabase();
  return getPrisma();
}

/** Disconnect the active client before an atomic database-file replacement. */
export async function disconnectDatabase() {
  if (globalForPrisma.prisma) await globalForPrisma.prisma.$disconnect();
  globalForPrisma.prisma = undefined;
  globalForPrisma.databaseReady = undefined;
}
