import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { SYNC_MODEL_CONFIG } from '@/lib/sync/sync-config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..');

/** Load the auto-generated bootstrap DDL JSON */
function loadBootstrapDDL(): { tables: Record<string, string>; indexes: string[] } {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, 'src', 'lib', 'generated', 'bootstrap-ddl.json'), 'utf-8'),
  );
}

/** Parse all table names from the generated DDL tables object */
function getBootstrapTableNames(ddl: { tables: Record<string, string> }): Set<string> {
  return new Set(Object.keys(ddl.tables).map(t => t.toLowerCase()));
}

/**
 * Parse columns from a single CREATE TABLE statement string.
 * Returns the set of column names (lowercased).
 */
function parseCreateTableColumns(createTableSQL: string): Set<string> {
  // Extract the body between the outer parens
  const bodyMatch = createTableSQL.match(/\(([\s\S]+)\)/);
  if (!bodyMatch) return new Set();

  const body = bodyMatch[1];
  const columns = new Set<string>();

  for (const line of body.split(',')) {
    const trimmed = line.trim();
    // Skip FOREIGN KEY / PRIMARY KEY / constraint lines
    if (/^(FOREIGN\s+KEY|PRIMARY\s+KEY|CONSTRAINT|UNIQUE)/i.test(trimmed)) continue;
    // First token is the column name
    const colMatch = trimmed.match(/^(\w+)/);
    if (colMatch) {
      columns.add(colMatch[1].toLowerCase());
    }
  }
  return columns;
}

/** Get all Prisma DMMF models */
function getPrismaModels() {
  return Prisma.dmmf.datamodel.models;
}

/** Get the database table name for a Prisma model */
function getTableName(model: (typeof Prisma.dmmf.datamodel.models)[number]): string {
  return (model.dbName || model.name).toLowerCase();
}

/**
 * For a given model, return a map of Prisma field name → db column name
 * for *scalar* fields only (relations excluded).
 */
function getFieldColumnMap(
  model: (typeof Prisma.dmmf.datamodel.models)[number],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const field of model.fields) {
    if (field.kind === 'object' || field.kind === 'enum' || field.isList) continue;
    if (field.kind === 'unsupported') continue;
    const colName = (field.dbName || field.name).toLowerCase();
    map.set(field.name, colName);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Schema Consistency – multi-source drift detection', () => {
  const prismaModels = getPrismaModels();
  const bootstrapDDL = loadBootstrapDDL();
  const bootstrapTables = getBootstrapTableNames(bootstrapDDL);
  const syncMap: Record<string, Record<string, string>> = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'src', 'lib', 'sync', 'sync-map.json'), 'utf-8'),
  );

  // -----------------------------------------------------------------------
  // Test 1
  // -----------------------------------------------------------------------
  it('Every Prisma model has a matching bootstrap DDL table', () => {
    const missingInBootstrap: string[] = [];
    const prismaTableNames = new Set<string>();

    for (const model of prismaModels) {
      const tableName = getTableName(model);
      prismaTableNames.add(tableName);
      if (!bootstrapTables.has(tableName)) {
        missingInBootstrap.push(`${model.name} (table: ${tableName})`);
      }
    }

    expect(
      missingInBootstrap,
      `Prisma models missing a CREATE TABLE in bootstrap DDL:\n  ${missingInBootstrap.join('\n  ')}`,
    ).toEqual([]);

    // Also check the reverse: bootstrap tables not in Prisma
    const extraInBootstrap: string[] = [];
    for (const bTable of Array.from(bootstrapTables)) {
      if (!prismaTableNames.has(bTable)) {
        extraInBootstrap.push(bTable);
      }
    }

    expect(
      extraInBootstrap,
      `bootstrap DDL has CREATE TABLEs not in Prisma:\n  ${extraInBootstrap.join('\n  ')}`,
    ).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Test 2
  // -----------------------------------------------------------------------
  it('Every Prisma model has sync-map.json entries', () => {
    const syncMapModelNames = new Set(Object.keys(syncMap));

    const missingInSyncMap: string[] = [];
    for (const model of prismaModels) {
      if (!syncMapModelNames.has(model.name)) {
        missingInSyncMap.push(model.name);
      }
    }
    expect(
      missingInSyncMap,
      `Prisma models missing from sync-map.json:\n  ${missingInSyncMap.join('\n  ')}`,
    ).toEqual([]);

    const prismaModelNames = new Set(prismaModels.map((m) => m.name));
    const extraInSyncMap: string[] = [];
    for (const smModel of Array.from(syncMapModelNames)) {
      if (!prismaModelNames.has(smModel)) {
        extraInSyncMap.push(smModel);
      }
    }
    expect(
      extraInSyncMap,
      `sync-map.json has models not in Prisma DMMF:\n  ${extraInSyncMap.join('\n  ')}`,
    ).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Test 3
  // -----------------------------------------------------------------------
  it('Sync-map @map annotations match Prisma DMMF', () => {
    const mismatches: string[] = [];

    for (const model of prismaModels) {
      const modelSyncMap = (syncMap as any)[model.name];
      if (!modelSyncMap) continue;

      for (const field of model.fields) {
        if (field.kind === 'object' || field.kind === 'enum' || field.isList) continue;
        if (field.kind === 'unsupported') continue;

        const dbName = field.dbName;
        if (!dbName) continue;

        const syncMapValue = modelSyncMap[field.name];
        if (syncMapValue === undefined) {
          mismatches.push(
            `${model.name}.${field.name}: has @map("${dbName}") in Prisma but is missing from sync-map.json`,
          );
        } else if (syncMapValue !== dbName) {
          mismatches.push(
            `${model.name}.${field.name}: Prisma @map="${dbName}" but sync-map says "${syncMapValue}"`,
          );
        }
      }
    }

    expect(
      mismatches,
      `Sync-map ↔ Prisma @map mismatches:\n  ${mismatches.join('\n  ')}`,
    ).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Test 4
  // -----------------------------------------------------------------------
  it('Every Prisma field is represented in generated bootstrap DDL', () => {
    const missingColumns: string[] = [];

    for (const model of prismaModels) {
      // Map Prisma model name -> bootstrap table name (lowercased)
      const tableName = (model.dbName || model.name).toLowerCase();

      // Collect all expected column names for this model
      // Normal scalar fields + relation FK fields (like vehicleId)
      const fieldColMap = new Map<string, string>();
      for (const field of model.fields) {
        // Skip relation objects (e.g. `vehicle Vehicle?`) but KEEP scalar FKs (e.g. `vehicleId String?`)
        if (field.kind === 'object') continue;

        const colName = (field.dbName || field.name).toLowerCase();
        fieldColMap.set(field.name, colName);
      }

      // Get the CREATE TABLE SQL from the generated DDL
      const createTableSQL = bootstrapDDL.tables[tableName];
      if (!createTableSQL) continue; // covered by Test 1

      const bootstrapCols = parseCreateTableColumns(createTableSQL);

      for (const [fieldName, colName] of Array.from(fieldColMap.entries())) {
        if (!bootstrapCols.has(colName)) {
          missingColumns.push(
            `${model.name}.${fieldName} → column "${colName}" missing from generated DDL table "${tableName}"`,
          );
        }
      }
    }

    expect(
      missingColumns,
      `Prisma columns missing in generated bootstrap DDL:\n  ${missingColumns.join('\n  ')}`,
    ).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Test 5
  // -----------------------------------------------------------------------
  it('SYNC_MODEL_CONFIG covers all Prisma models', () => {
    const knownExclusions = new Set(['SyncState', 'AuditLog', 'Role', 'DeviceIdentity', 'SyncOutboxEvent']);
    const syncConfigKeys = new Set(Object.keys(SYNC_MODEL_CONFIG));
    const prismaModelNames = new Set(prismaModels.map((m) => m.name));

    const invalidConfigModels: string[] = [];
    for (const configModel of Array.from(syncConfigKeys)) {
      if (!prismaModelNames.has(configModel)) {
        invalidConfigModels.push(configModel);
      }
    }
    expect(
      invalidConfigModels,
      `SYNC_MODEL_CONFIG has models not in Prisma:\n  ${invalidConfigModels.join('\n  ')}`,
    ).toEqual([]);

    const missingFromConfig: string[] = [];
    for (const model of prismaModels) {
      if (knownExclusions.has(model.name)) continue;
      if (!syncConfigKeys.has(model.name)) {
        missingFromConfig.push(model.name);
      }
    }
    expect(
      missingFromConfig,
      `Prisma models missing from SYNC_MODEL_CONFIG (not in exclusion list):\n  ${missingFromConfig.join('\n  ')}`,
    ).toEqual([]);

    const tableMismatches: string[] = [];
    for (const [modelName, config] of Object.entries(SYNC_MODEL_CONFIG)) {
      const prismaModel = prismaModels.find((m) => m.name === modelName);
      if (!prismaModel) continue;

      const expectedTable = getTableName(prismaModel);
      if (config.table !== expectedTable) {
        tableMismatches.push(
          `${modelName}: SYNC_MODEL_CONFIG.table="${config.table}" but Prisma @@map="${expectedTable}"`,
        );
      }
    }
    expect(
      tableMismatches,
      `SYNC_MODEL_CONFIG table names don't match Prisma @@map:\n  ${tableMismatches.join('\n  ')}`,
    ).toEqual([]);
  });
});
