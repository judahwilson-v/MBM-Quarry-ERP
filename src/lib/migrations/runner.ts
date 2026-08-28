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

/**
 * Get the set of already-applied migration versions.
 */
async function getAppliedVersions(prisma: PrismaClient): Promise<Set<number>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ version: number }>>(
    `SELECT version FROM schema_migrations ORDER BY version`
  );
  return new Set(rows.map((r) => r.version));
}

/**
 * Run all pending migrations in version order.
 * Returns the number of migrations applied.
 */
export async function runMigrations(
  prisma: PrismaClient,
  migrations: Migration[]
): Promise<{ applied: number; errors: string[] }> {
  await ensureMigrationTable(prisma);
  const applied = await getAppliedVersions(prisma);
  const errors: string[] = [];
  let appliedCount = 0;

  // Sort migrations by version (ascending)
  const sorted = [...migrations].sort((a, b) => a.version - b.version);

  for (const migration of sorted) {
    if (applied.has(migration.version)) {
      continue; // Already applied — skip
    }

    console.log(
      `[Migration] Applying v${migration.version}: ${migration.id} — ${migration.description}`
    );

    let inTransaction = false;
    try {
      const statements = await migration.up(prisma);
      const checksum = checksumStatements(statements);

      if (statements.length > 0) {
        await prisma.$executeRawUnsafe("BEGIN IMMEDIATE");
        inTransaction = true;

        for (const sql of statements) {
          if (sql.trim().length === 0) continue;
          await prisma.$executeRawUnsafe(sql);
        }

        // Record the migration as applied inside the transaction
        await prisma.$executeRawUnsafe(
          `INSERT OR IGNORE INTO schema_migrations (id, version, checksum) VALUES (?, ?, ?)`,
          migration.id,
          migration.version,
          checksum
        );

        await prisma.$executeRawUnsafe("COMMIT");
        inTransaction = false;
      } else {
        // No SQL statements to execute (e.g. State B no-op), record version directly
        await prisma.$executeRawUnsafe(
          `INSERT OR IGNORE INTO schema_migrations (id, version, checksum) VALUES (?, ?, ?)`,
          migration.id,
          migration.version,
          checksum
        );
      }

      console.log(`[Migration] ✅ v${migration.version}: ${migration.id} applied successfully`);
      appliedCount++;
    } catch (err: any) {
      if (inTransaction) {
        try {
          await prisma.$executeRawUnsafe("ROLLBACK");
        } catch (rollbackErr: any) {
          console.error(`[Migration] Failed to rollback transaction:`, rollbackErr?.message);
        }
      }

      const msg = `[Migration] ❌ v${migration.version}: ${migration.id} FAILED — ${err?.message || err}`;
      console.error(msg);
      errors.push(msg);
      // STOP — do not apply further migrations after a failure
      break;
    }
  }

  return { applied: appliedCount, errors };
}
