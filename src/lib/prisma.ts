import path from "path";
import { PrismaClient } from "@prisma/client";
import { initializeDatabase } from "./bootstrap";
import { assertRestoreIsNotInProgress, assertRestartNotRequired, isActiveRestoreToken } from "./sync/restore-state";
import { recoverInterruptedRestore } from "./sync/restore-files";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  gated?: PrismaClient;
  databaseReady?: Promise<void>;
};

// Hidden marker so the restore machinery can recognize the PUBLIC gated client it
// was handed and substitute its scoped internal client. Not a security boundary
// against the app's own code; the barrier boundary is the restore-session token.
export const GATED_CLIENT_MARKER: unique symbol = Symbol.for("mbm.gatedDbClient") as any;

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

// Every client handed to the query layer is gated at TWO levels:
//  1. Execution level ($extends): every MODEL operation - including operations on a
//     delegate captured before the barrier (sync pullSync's per-row delegate pattern),
//     a lazy PrismaPromise constructed before the barrier and awaited after, and model
//     operations inside an interactive transaction - re-checks the barriers when it
//     actually executes, and refuses.
//  2. Property level (Proxy): raw escape hatches ($queryRawUnsafe/$executeRawUnsafe,
//     $transaction, $disconnect) re-check the barriers at access time.
// A retained reference can therefore not auto-reconnect and write into the swapped
// database file. Remaining stated limit: a lazy RAW query constructed before the
// barrier (const q = db.$queryRawUnsafe(...), awaited after) executes ungated - no
// app pattern does this; restore internals use the scoped trusted client below.
function gateClient(client: PrismaClient): PrismaClient {
  const executionGated = client.$extends({
    query: {
      $allModels: {
        async $allOperations({ query, args }) {
          assertRestoreIsNotInProgress();
          assertRestartNotRequired();
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
  return new Proxy(executionGated, {
    get(target, prop) {
      if (prop === GATED_CLIENT_MARKER) return true;
      assertRestoreIsNotInProgress();
      assertRestartNotRequired();
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

// Scoped internal access for the restore machinery ONLY: reachable solely with the
// opaque session token that beginRestore hands to the restore owner, and only while
// that restore is active. This is not a general unprotected escape hatch.
export function getTrustedRestoreClient(token: unknown): PrismaClient {
  if (!isActiveRestoreToken(token)) throw new Error("Internal restore client requires an active restore session.");
  return getPrisma();
}

export async function getDb() {
  assertRestoreIsNotInProgress();
  assertRestartNotRequired();
  await ensureDatabase();
  if (!globalForPrisma.gated) globalForPrisma.gated = gateClient(getPrisma());
  return globalForPrisma.gated;
}

/** Disconnect the active client before an atomic database-file replacement. */
export async function disconnectDatabase() {
  if (globalForPrisma.prisma) await globalForPrisma.prisma.$disconnect();
  globalForPrisma.prisma = undefined;
  globalForPrisma.gated = undefined;
  globalForPrisma.databaseReady = undefined;
}
