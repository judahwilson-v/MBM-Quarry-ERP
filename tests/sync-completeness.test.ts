import { describe, it, expect } from 'vitest';
import {
  SYNC_MODEL_CONFIG,
  PUSH_PRIORITY,
  PULL_ORDER,
  REMOTE_CONFLICT_COLUMNS,
  LOCAL_CONFLICT_FIELDS,
  type SyncModelName,
} from '@/lib/sync/sync-config';
import { Prisma } from '@prisma/client';
import syncMap from '../src/lib/sync/sync-map.json';

const syncModelNames = Object.keys(SYNC_MODEL_CONFIG) as SyncModelName[];

describe('sync-completeness', () => {
  it('PUSH_PRIORITY contains all SYNC_MODEL_CONFIG models', () => {
    const pushKeys = Object.keys(PUSH_PRIORITY) as SyncModelName[];

    for (const model of syncModelNames) {
      expect(pushKeys).toContain(model);
    }

    for (const key of pushKeys) {
      expect(syncModelNames).toContain(key);
    }
  });

  it('PULL_ORDER contains all SYNC_MODEL_CONFIG models', () => {
    for (const model of syncModelNames) {
      expect(PULL_ORDER).toContain(model);
    }

    expect(PULL_ORDER).toHaveLength(syncModelNames.length);

    const unique = new Set(PULL_ORDER);
    expect(unique.size).toBe(PULL_ORDER.length);
  });

  it('REMOTE_CONFLICT_COLUMNS has entries for all sync models', () => {
    for (const model of syncModelNames) {
      const value = REMOTE_CONFLICT_COLUMNS[model];
      expect(value, `REMOTE_CONFLICT_COLUMNS missing entry for ${model}`).toBeDefined();
      expect(typeof value).toBe('string');
      expect(value.length, `REMOTE_CONFLICT_COLUMNS[${model}] must be non-empty`).toBeGreaterThan(0);
    }
  });

  it('LOCAL_CONFLICT_FIELDS has entries for all sync models', () => {
    for (const model of syncModelNames) {
      const value = LOCAL_CONFLICT_FIELDS[model];
      expect(value, `LOCAL_CONFLICT_FIELDS missing entry for ${model}`).toBeDefined();
      expect(typeof value).toBe('string');
      expect(value.length, `LOCAL_CONFLICT_FIELDS[${model}] must be non-empty`).toBeGreaterThan(0);
    }
  });

  it('sync-map.json covers all SYNC_MODEL_CONFIG models', () => {
    const mapKeys = Object.keys(syncMap);

    for (const model of syncModelNames) {
      expect(mapKeys, `sync-map.json missing entry for ${model}`).toContain(model);

      const entry = (syncMap as Record<string, Record<string, string>>)[model];
      expect(entry, `sync-map.json[${model}] should be an object`).toBeDefined();
      expect(entry.id, `sync-map.json[${model}] must have an 'id' field mapping`).toBeDefined();
    }
  });

  it('PUSH_PRIORITY values are unique and sequential', () => {
    const values = Object.values(PUSH_PRIORITY);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size, 'PUSH_PRIORITY values must be unique').toBe(values.length);

    const n = syncModelNames.length;
    const expected = Array.from({ length: n }, (_, i) => i + 1).sort((a, b) => a - b);
    const sorted = [...values].sort((a, b) => a - b);
    expect(sorted).toEqual(expected);
  });

  it('SYNC_MODEL_CONFIG table names match Prisma dbName', () => {
    const dmmfModels = Prisma.dmmf.datamodel.models;

    for (const model of syncModelNames) {
      const config = SYNC_MODEL_CONFIG[model];
      const prismaModel = dmmfModels.find((m) => m.name === model);
      expect(prismaModel, `Prisma DMMF should contain model ${model}`).toBeDefined();

      const dbName = prismaModel!.dbName ?? prismaModel!.name;
      expect(
        config.table,
        `SYNC_MODEL_CONFIG[${model}].table ("${config.table}") should match Prisma dbName ("${dbName}")`,
      ).toBe(dbName);
    }
  });

  it('LOCAL_CONFLICT_FIELDS correspond to REMOTE_CONFLICT_COLUMNS via sync-map', () => {
    for (const model of syncModelNames) {
      const localField = LOCAL_CONFLICT_FIELDS[model];
      const remoteColumn = REMOTE_CONFLICT_COLUMNS[model];

      if (localField === 'id' && remoteColumn === 'id') {
        // Direct match exception — both are 'id'
        continue;
      }

      const modelMap = (syncMap as Record<string, Record<string, string>>)[model];
      expect(modelMap, `sync-map.json must have an entry for ${model}`).toBeDefined();

      const mappedColumn = modelMap[localField];
      expect(
        mappedColumn,
        `sync-map.json[${model}] must contain a mapping for LOCAL_CONFLICT_FIELDS value "${localField}"`,
      ).toBeDefined();
      expect(
        mappedColumn,
        `For model ${model}: sync-map.json[${model}]["${localField}"] = "${mappedColumn}" should equal REMOTE_CONFLICT_COLUMNS "${remoteColumn}"`,
      ).toBe(remoteColumn);
    }
  });
});
