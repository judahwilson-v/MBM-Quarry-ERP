import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Versioned Application Migration Runner
// ---------------------------------------------------------------------------
// Replaces the ad-hoc ensureSQLiteColumn / bootstrap-ddl approach with a
// deterministic, ordered, checksummed migration system.
//
// Invariants:
// 1. Every migration has a unique integer version and an immutable SQL body.
// 2. Migrations execute in strict version order within a transaction.
// 3. A migration is recorded in `schema_migrations` only after success.
// 4. Already-applied migrations are skipped (idempotent on re-run).
// 5. A failed migration rolls back and aborts startup — the database remains
//    in the last known-good state.
// ---------------------------------------------------------------------------

export interface Migration {
  version: number;
  id: string;           // human-readable identifier, e.g. "001_baseline"
  description: string;
  /** Return the SQL statements to execute. Receives prisma for introspection. */
  up: (prisma: PrismaClient) => Promise<string[]>;
}

/**
 * Compute a stable checksum for a migration's SQL statements.
 */
function checksumStatements(statements: string[]): string {
  const hash = createHash("sha256");
  for (const s of statements) {
    hash.update(s.trim());
  }
  return hash.digest("hex").slice(0, 16);
}

/**
 * Ensure the schema_migrations table exists.
 */
async function ensureMigrationTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      version INTEGER NOT NULL,
      checksum TEXT,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Add checksum column to existing schema_migrations tables that lack it
  try {
    const cols = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `PRAGMA table_info(schema_migrations)`
    );
    if (!cols.some((c) => c.name === "checksum")) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE schema_migrations ADD COLUMN checksum TEXT`
      );
    }
  } catch {
    // If PRAGMA fails, the table was just created with the checksum column
  }
}

function isDatabaseBusy(error: unknown): boolean {
  const text = String((error as any)?.message || error).toLowerCase();
  return text.includes("database is locked") || text.includes("database is busy") || (error as any)?.code === "P2034";
}

async function retryDatabaseBusy<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await work(); }
    catch (error) {
      if (attempt >= 3 || !isDatabaseBusy(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, 50 * (2 ** attempt)));
    }
  }
}

export async function runMigrations(
  prisma: PrismaClient,
  migrations: Migration[]
): Promise<{ applied: number; errors: string[] }> {
  const errors: string[] = [];
  let appliedCount = 0;
  try {
    await retryDatabaseBusy(() => ensureMigrationTable(prisma));
  } catch (err: any) {
    return { applied: 0, errors: [`[Migration] Tracking table unavailable: ${err?.message || err}`] };
  }

  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    try {
      // The interactive transaction pins introspection, DDL and the applied
      // marker to one connection. Bare BEGIN/COMMIT raw calls do not own a
      // Prisma pooled connection and can strand a transaction on another one.
      const didApply = await retryDatabaseBusy(() => prisma.$transaction(async tx => {
        const rows = await tx.$queryRawUnsafe<Array<{ version: number }>>(
          "SELECT version FROM schema_migrations WHERE version = ?", migration.version
        );
        if (rows.length > 0) return false;
        const statements = await migration.up(tx as unknown as PrismaClient);
        const checksum = checksumStatements(statements);
        for (const sql of statements) {
          if (sql.trim().length > 0) await tx.$executeRawUnsafe(sql);
        }
        await tx.$executeRawUnsafe(
          "INSERT INTO schema_migrations (id, version, checksum) VALUES (?, ?, ?)",
          migration.id, migration.version, checksum
        );
        return true;
      }, { maxWait: 10000, timeout: 20000 }));
      if (didApply) {
        appliedCount++;
        console.log(`[Migration] v${migration.version}: ${migration.id} applied successfully`);
      }
    } catch (err: any) {
      const msg = `[Migration] v${migration.version}: ${migration.id} FAILED - ${err?.message || err}`;
      console.error(msg);
      errors.push(msg);
      break;
    }
  }
  return { applied: appliedCount, errors };
}
