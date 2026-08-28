import assert from "assert";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { ALL_MIGRATIONS, runMigrations } from "../src/lib/migrations";
import { stagedRestoreFromSupabase, type StagedRestoreDependencies } from "../src/lib/sync/staged-restore";
import { moveDatabaseFiles, recoverInterruptedRestore, startRestoreJournal, updateRestoreJournal } from "../src/lib/sync/restore-files";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mbm-phase3-"));
const databaseUrl = (file: string) => `file:${file.replace(/\\/g, "/")}`;
const digest = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

async function createActive(name: string) {
  const file = path.join(tempRoot, `${name}.db`);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl(file) } } });
  const result = await runMigrations(db, ALL_MIGRATIONS);
  assert.equal(result.errors.length, 0, result.errors.join("\n"));
  return { file, db };
}

const noRows: StagedRestoreDependencies["fetchRows"] = async () => ({ rows: [] });

async function expectUnchangedAfterFailure(name: string, fetchRows: NonNullable<StagedRestoreDependencies["fetchRows"]>) {
  const { file, db } = await createActive(name);
  const before = digest(file);
  const result = await stagedRestoreFromSupabase(db, { force: true, acknowledgeUnsynced: true }, { activePath: file, fetchRows });
  await db.$disconnect();
  assert.equal(result.success, false, "restore should fail");
  assert.equal(digest(file), before, "active database changed after a failed staged restore");
}

async function main() {
  try {
    await expectUnchangedAfterFailure("network", async () => ({ rows: [], error: "simulated network outage" }));

    await expectUnchangedAfterFailure("invalid-row", async (table) => table === "global_settings"
      ? { rows: [{ quarry_name: "Missing primary key" }] }
      : { rows: [] });

    const timestamp = new Date().toISOString();
    await expectUnchangedAfterFailure("unique", async (table) => table === "vehicles"
      ? { rows: [
          { id: "vehicle-a", vehicle_number: "DUPLICATE", trip_count: 0, created_at: timestamp, updated_at: timestamp },
          { id: "vehicle-b", vehicle_number: "DUPLICATE", trip_count: 0, created_at: timestamp, updated_at: timestamp },
        ] }
      : { rows: [] });

    const successful = await createActive("success");
    const original = digest(successful.file);
    const result = await stagedRestoreFromSupabase(successful.db, { force: true, acknowledgeUnsynced: true }, {
      activePath: successful.file,
      fetchRows: noRows,
      disconnectActive: () => successful.db.$disconnect(),
    });
    assert.equal(result.success, true, result.errors.map((error) => error.error).join("\n"));
    assert.ok(result.backupPath && fs.existsSync(result.backupPath), "successful restore did not preserve a backup");
    assert.equal(digest(result.backupPath!), original, "backup is not the exact pre-restore database");
    const reopened = new PrismaClient({ datasources: { db: { url: databaseUrl(successful.file) } } });
    assert.equal(await reopened.party.count(), 0, "staged database did not replace the active database");
    await reopened.$disconnect();

    const crashed = await createActive("crash-recovery");
    await crashed.db.$disconnect();
    const crashedBefore = digest(crashed.file);
    const backup = `${crashed.file}.pre-restore-test.bak`;
    const stage = `${crashed.file}.stage`;
    startRestoreJournal(crashed.file, backup, stage);
    moveDatabaseFiles(crashed.file, backup);
    updateRestoreJournal(crashed.file, "backup-moved");
    assert.equal(recoverInterruptedRestore(crashed.file), true, "interrupted restore journal was not recovered");
    assert.equal(digest(crashed.file), crashedBefore, "crash recovery did not restore the original database");

    console.log("Phase 3 staged-restore safety suite: 5/5 passed.");
  } finally {
    // Prisma's Windows engine can release SQLite handles a moment after $disconnect().
    // This must not mask a completed safety assertion: the OS releases any remaining
    // engine handle when this test process exits, and the directory is OS-temp only.
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
      console.warn(`Temporary Phase 3 test directory will be released on process exit: ${tempRoot}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
