import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { ALL_MIGRATIONS, runMigrations } from "@/lib/migrations";
import { verifySchemaSync } from "@/lib/bootstrap";
import { createSyncClient } from "@/lib/supabase/client-sync";
import { disconnectDatabase, getDatabaseFilePath } from "@/lib/prisma";
import { PULL_ORDER, SYNC_MODEL_CONFIG } from "./sync-config";
import SYNC_MAP from "./sync-map.json";
import { beginRestore, endRestore } from "./restore-state";
import { cleanupDatabaseFiles, clearRestoreJournal, moveDatabaseFiles, startRestoreJournal, updateRestoreJournal } from "./restore-files";

export type RestoreError = { table: string; rowId?: string; error: string };
export type StagedRestoreOptions = { force?: boolean; acknowledgeUnsynced?: boolean };
export type StagedRestoreResult = {
  success: boolean;
  tablesRestored: number;
  totalRows: number;
  errors: RestoreError[];
  backupPath?: string;
};
export type StagedRestoreDependencies = {
  activePath?: string;
  fetchRows?: (table: string, timeColumn: string) => Promise<{ rows: Record<string, unknown>[]; error?: string }>;
  disconnectActive?: () => Promise<void>;
};

const RESTORE_SKIP_TABLES = new Set(["audit_logs"]);
const PAGE_SIZE = 1000;

const dbToCamel: Record<string, string> = {};
for (const model of Object.values(SYNC_MAP)) {
  for (const [camel, db] of Object.entries(model as Record<string, string>)) dbToCamel[db] = camel;
}

function sqliteUrl(filePath: string) {
  return `file:${filePath.replace(/\\/g, "/")}`;
}

function stagingPathFor(activePath: string) {
  const parsed = path.parse(activePath);
  return path.join(parsed.dir, `.${parsed.name}.restore-${randomUUID()}.staging${parsed.ext || ".db"}`);
}

function timestampForFileName() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function toCamelCase(value: unknown): unknown {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/i.test(value)) {
    const withTimezone = /Z|[+-]\d{2}:\d{2}$/i.test(value) ? value : `${value}Z`;
    const date = new Date(withTimezone);
    return Number.isNaN(date.getTime()) ? value : date;
  }
  if (Array.isArray(value)) return value.map(toCamelCase);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      dbToCamel[key] ?? key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      toCamelCase(nested),
    ]));
  }
  return value;
}

async function fetchAllRows(
  supabase: ReturnType<typeof createSyncClient>,
  table: string,
  timeColumn: string,
): Promise<{ rows: Record<string, unknown>[]; error?: string }> {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select("*").order(timeColumn, { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    if (error) return { rows, error: `Fetch failed at offset ${offset}: ${error.message}` };
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < PAGE_SIZE) return { rows };
  }
}

function scalarPayload(modelName: string, row: Record<string, unknown>) {
  const model = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === modelName);
  if (!model) throw new Error(`Unknown Prisma model ${modelName}`);
  const scalarFields = model.fields.filter((field) => field.kind === "scalar");
  const allowed = new Set(scalarFields.map((field) => field.name));
  const converted = toCamelCase(row) as Record<string, unknown>;
  const unknown = Object.keys(converted).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Remote payload includes unsupported field(s): ${unknown.join(", ")}`);
  for (const field of scalarFields) {
    if (field.isRequired && (converted[field.name] === null || converted[field.name] === undefined)) {
      throw new Error(`Required field ${modelName}.${field.name} is null or missing in remote data`);
    }
  }
  return converted;
}

function assertNoDuplicateUniqueValues(modelName: string, rows: Record<string, unknown>[]) {
  const model = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === modelName);
  if (!model) throw new Error(`Unknown Prisma model ${modelName}`);
  for (const field of model.fields.filter((candidate) => candidate.kind === "scalar" && candidate.isUnique && !candidate.isId)) {
    const values = new Set<string>();
    for (const row of rows) {
      const value = row[field.name];
      if (value === null || value === undefined) continue;
      const serialized = value instanceof Date ? value.toISOString() : JSON.stringify(value);
      if (values.has(serialized)) throw new Error(`Duplicate remote value for unique field ${modelName}.${field.name}`);
      values.add(serialized);
    }
  }
}

async function pendingLocalSyncCount(db: PrismaClient) {
  const state = await db.syncState.findUnique({ where: { id: "default" } });
  return db.auditLog.count({ where: { createdAt: { gt: state?.lastSyncedAt ?? new Date(0) } } });
}

async function validateStage(stage: PrismaClient, expectedCounts: Map<string, number>) {
  await verifySchemaSync(stage);
  const foreignKeyViolations = await stage.$queryRawUnsafe<Array<Record<string, unknown>>>("PRAGMA foreign_key_check");
  if (foreignKeyViolations.length) throw new Error(`Foreign-key validation failed with ${foreignKeyViolations.length} violation(s)`);
  for (const modelName of PULL_ORDER) {
    const config = SYNC_MODEL_CONFIG[modelName];
    if (RESTORE_SKIP_TABLES.has(config.table)) continue;
    const actual = await (stage as any)[config.delegate].count();
    const expected = expectedCounts.get(config.table) ?? 0;
    if (actual !== expected) throw new Error(`Row-count validation failed for ${config.table}: expected ${expected}, found ${actual}`);
  }
  // Both pragmas return result rows, so SQLite requires a query API here.
  await stage.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
  await stage.$queryRawUnsafe("PRAGMA journal_mode = DELETE");
}

async function assertActiveDatabaseReopens(activePath: string) {
  const client = new PrismaClient({ datasources: { db: { url: sqliteUrl(activePath) } } });
  try {
    await verifySchemaSync(client);
    const violations = await client.$queryRawUnsafe<Array<Record<string, unknown>>>("PRAGMA foreign_key_check");
    if (violations.length) throw new Error(`Replacement database has ${violations.length} foreign-key violation(s)`);
  } finally {
    await client.$disconnect();
  }
}

export async function stagedRestoreFromSupabase(
  activeDb: PrismaClient,
  options: StagedRestoreOptions = {},
  dependencies: StagedRestoreDependencies = {},
): Promise<StagedRestoreResult> {
  if (!beginRestore()) return { success: false, tablesRestored: 0, totalRows: 0, errors: [{ table: "global", error: "A restore is already in progress." }] };
  const activePath = dependencies.activePath ?? getDatabaseFilePath();
  const stagePath = stagingPathFor(activePath);
  const errors: RestoreError[] = [];
  let stage: PrismaClient | undefined;
  let tablesRestored = 0;
  let totalRows = 0;
  let backupPath: string | undefined;

  try {
    if (!fs.existsSync(activePath)) throw new Error(`Active database file does not exist: ${activePath}`);
    const pending = await pendingLocalSyncCount(activeDb);
    if (pending > 0 && !options.acknowledgeUnsynced) {
      throw new Error(`Restore refused: ${pending} local audit event(s) have not been synced. Export/resolve them, then explicitly acknowledge the overwrite.`);
    }
    if (!options.force) {
      const localData = await activeDb.auditLog.count();
      if (localData > 0) throw new Error("Restore refused: local data exists. Use force=true only after reviewing the backup that will be created.");
    }

    stage = new PrismaClient({ datasources: { db: { url: sqliteUrl(stagePath) } } });
    const migrations = await runMigrations(stage, ALL_MIGRATIONS);
    if (migrations.errors.length) throw new Error(migrations.errors.join("; "));

    const supabase = dependencies.fetchRows ? undefined : createSyncClient();
    const expectedCounts = new Map<string, number>();
    for (const modelName of PULL_ORDER) {
      const config = SYNC_MODEL_CONFIG[modelName];
      if (RESTORE_SKIP_TABLES.has(config.table)) continue;
      const fetched = dependencies.fetchRows
        ? await dependencies.fetchRows(config.table, config.timeColumn)
        : await fetchAllRows(supabase!, config.table, config.timeColumn);
      if (fetched.error) throw new Error(`${config.table}: ${fetched.error}`);
      const rows = fetched.rows.map((row) => scalarPayload(modelName, row));
      assertNoDuplicateUniqueValues(modelName, rows);
      const delegate = (stage as any)[config.delegate];
      for (const row of rows) await delegate.create({ data: row });
      expectedCounts.set(config.table, rows.length);
      totalRows += rows.length;
      if (rows.length) tablesRestored++;
    }
    const now = new Date();
    await stage.syncState.upsert({ where: { id: "default" }, update: { lastSyncedAt: now, status: "IDLE", lastError: null }, create: { id: "default", lastSyncedAt: now, status: "IDLE" } });
    await stage.syncState.upsert({ where: { id: "pull_state" }, update: { lastSyncedAt: now, status: "IDLE", lastError: null }, create: { id: "pull_state", lastSyncedAt: now, status: "IDLE" } });
    await validateStage(stage, expectedCounts);
    await stage.$disconnect();
    stage = undefined;

    await activeDb.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
    await (dependencies.disconnectActive ?? disconnectDatabase)();
    backupPath = `${activePath}.pre-restore-${timestampForFileName()}.bak`;
    startRestoreJournal(activePath, backupPath, stagePath);
    moveDatabaseFiles(activePath, backupPath);
    updateRestoreJournal(activePath, "backup-moved");
    try {
      moveDatabaseFiles(stagePath, activePath);
      updateRestoreJournal(activePath, "stage-moved");
      await assertActiveDatabaseReopens(activePath);
      clearRestoreJournal(activePath);
    } catch (swapError) {
      const failedPath = `${stagePath}.failed`;
      if (fs.existsSync(activePath)) moveDatabaseFiles(activePath, failedPath);
      moveDatabaseFiles(backupPath, activePath);
      clearRestoreJournal(activePath);
      throw swapError;
    }

    return { success: true, tablesRestored, totalRows, errors, backupPath };
  } catch (error) {
    errors.push({ table: "global", error: error instanceof Error ? error.message : String(error) });
    return { success: false, tablesRestored, totalRows, errors, backupPath };
  } finally {
    if (stage) await stage.$disconnect().catch(() => undefined);
    cleanupDatabaseFiles(stagePath);
    endRestore();
  }
}
