#!/usr/bin/env node
// ============================================================================
// generate-supabase-sql.js
// Auto-generates docs/database/supabase_schema.sql from Prisma's DMMF.
// ============================================================================

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// 1. Read Prisma DMMF
// ---------------------------------------------------------------------------
const { Prisma } = require('@prisma/client');
const models = Prisma.dmmf.datamodel.models;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const EXCLUDED_MODELS = ['SyncState'];

const TYPE_MAP = {
  String: 'TEXT',
  Int: 'INTEGER',
  Float: 'DOUBLE PRECISION',
  Boolean: 'BOOLEAN',
  DateTime: 'TIMESTAMPTZ',
  Json: 'JSONB',
  BigInt: 'BIGINT',
};

// Columns whose names hint they are commonly queried
const COMMON_INDEX_PATTERNS = ['date', 'name', 'status'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tableName(model) {
  return model.dbName || model.name.toLowerCase();
}

function columnName(field) {
  return field.dbName || field.name;
}

/**
 * Return the Prisma default-value descriptor, normalised.
 * Prisma DMMF stores defaults as either a literal value or
 * { name: '<funcName>', args: [...] }.
 */
function defaultDescriptor(field) {
  if (field.default === undefined || field.default === null) return null;
  if (typeof field.default === 'object' && field.default.name) return field.default;
  // literal
  return { __literal: true, value: field.default };
}

function isAutoincrement(desc) {
  return desc && desc.name === 'autoincrement';
}

function isUuidOrCuid(desc) {
  return desc && (desc.name === 'uuid' || desc.name === 'cuid');
}

function isNow(desc) {
  return desc && desc.name === 'now';
}

function isDbGenerated(desc) {
  return desc && desc.name === 'dbgenerated';
}

// ---------------------------------------------------------------------------
// Column SQL builder
// ---------------------------------------------------------------------------

function buildColumnSql(field) {
  const col = columnName(field);
  const desc = defaultDescriptor(field);
  const parts = [];

  // --- type (with autoincrement special-case) ---
  if (isAutoincrement(desc)) {
    parts.push(`"${col}"`, 'INTEGER GENERATED ALWAYS AS IDENTITY');
  } else {
    const pgType = TYPE_MAP[field.type] || 'TEXT';
    parts.push(`"${col}"`, pgType);
  }

  // --- default value ---
  if (!isAutoincrement(desc)) {
    if (field.isId && field.type === 'String') {
      parts.push('DEFAULT gen_random_uuid()');
    } else if (isUuidOrCuid(desc)) {
      parts.push('DEFAULT gen_random_uuid()');
    } else if (isNow(desc)) {
      parts.push('DEFAULT now()');
    } else if (field.isUpdatedAt) {
      parts.push('DEFAULT now()');
    } else if (isDbGenerated(desc)) {
      // args is typically ["'<expression>'"]
      const raw = (desc.args && desc.args[0]) || '';
      // Strip surrounding quotes if the whole arg is a single-quoted string
      const cleaned = raw.replace(/^['"]|['"]$/g, '');
      parts.push(`DEFAULT ${cleaned}`);
    } else if (desc && desc.__literal) {
      const v = desc.value;
      if (typeof v === 'string') {
        parts.push(`DEFAULT '${v.replace(/'/g, "''")}'`);
      } else if (typeof v === 'number') {
        parts.push(`DEFAULT ${v}`);
      } else if (typeof v === 'boolean') {
        parts.push(`DEFAULT ${v}`);
      }
    }
  }

  // --- constraints ---
  if (field.isId) {
    parts.push('PRIMARY KEY');
  }
  if (field.isRequired && !field.isId) {
    parts.push('NOT NULL');
  }
  if (field.isUnique && !field.isId) {
    parts.push('UNIQUE');
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Foreign-key collector
// ---------------------------------------------------------------------------

function collectForeignKeys(model, allModels) {
  const fks = [];
  const tbl = tableName(model);

  for (const field of model.fields) {
    if (field.kind !== 'object') continue;
    if (!field.relationFromFields || field.relationFromFields.length === 0) continue;

    const fkFieldName = field.relationFromFields[0];
    // Resolve the scalar field to get its dbName
    const scalarField = model.fields.find((f) => f.name === fkFieldName);
    const fkColumn = scalarField ? columnName(scalarField) : fkFieldName;

    // Find the referenced model to get its table name
    const refModel = allModels.find((m) => m.name === field.type);
    const refTable = refModel ? tableName(refModel) : field.type.toLowerCase();

    let onDelete = '';
    if (field.relationOnDelete === 'Cascade') {
      onDelete = ' ON DELETE CASCADE';
    } else if (field.relationOnDelete === 'SetNull') {
      onDelete = ' ON DELETE SET NULL';
    }

    fks.push(`  FOREIGN KEY ("${fkColumn}") REFERENCES "${refTable}"("id")${onDelete}`);
  }

  return fks;
}

// ---------------------------------------------------------------------------
// Index generator
// ---------------------------------------------------------------------------

function generateIndexes(model) {
  const tbl = tableName(model);
  const indexes = [];

  for (const field of model.fields) {
    if (field.kind !== 'scalar') continue;
    const col = columnName(field);

    // FK-style columns ending in _id
    if (col.endsWith('_id')) {
      indexes.push(
        `CREATE INDEX IF NOT EXISTS "idx_${tbl}_${col}" ON "${tbl}" ("${col}");`
      );
      continue;
    }

    // Commonly queried columns (date, name, status)
    const lower = col.toLowerCase();
    if (COMMON_INDEX_PATTERNS.some((p) => lower.includes(p)) && !field.isId) {
      indexes.push(
        `CREATE INDEX IF NOT EXISTS "idx_${tbl}_${col}" ON "${tbl}" ("${col}");`
      );
    }
  }

  return indexes;
}

// ---------------------------------------------------------------------------
// Main generation
// ---------------------------------------------------------------------------

function generate() {
  const filteredModels = models.filter((m) => !EXCLUDED_MODELS.includes(m.name));

  const tableStatements = [];
  const allIndexes = [];
  const tablesWithUpdatedAt = [];

  for (const model of filteredModels) {
    const tbl = tableName(model);

    // Scalar columns
    const scalarFields = model.fields.filter((f) => f.kind === 'scalar');
    const columnDefs = scalarFields.map((f) => `  ${buildColumnSql(f)}`);

    // Foreign keys
    const fks = collectForeignKeys(model, filteredModels);

    const allDefs = [...columnDefs, ...fks].join(',\n');
    tableStatements.push(`CREATE TABLE IF NOT EXISTS "${tbl}" (\n${allDefs}\n);`);

    // Indexes
    const indexes = generateIndexes(model);
    allIndexes.push(...indexes);

    // Track updated_at
    const hasUpdatedAt = scalarFields.some(
      (f) => columnName(f) === 'updated_at' || f.isUpdatedAt
    );
    if (hasUpdatedAt) {
      tablesWithUpdatedAt.push(tbl);
    }
  }

  // ---- Assemble output ----
  const lines = [];

  // Header
  lines.push('-- ==========================================================================');
  lines.push('-- AUTO-GENERATED from prisma/schema.prisma — DO NOT EDIT MANUALLY');
  lines.push(`-- Generated at: ${new Date().toISOString()}`);
  lines.push('-- ==========================================================================');
  lines.push('');

  // Tables
  lines.push('-- --------------------------------------------------------------------------');
  lines.push('-- TABLES');
  lines.push('-- --------------------------------------------------------------------------');
  lines.push('');
  for (const stmt of tableStatements) {
    lines.push(stmt);
    lines.push('');
  }

  // Indexes
  if (allIndexes.length > 0) {
    lines.push('-- --------------------------------------------------------------------------');
    lines.push('-- INDEXES');
    lines.push('-- --------------------------------------------------------------------------');
    lines.push('');
    for (const idx of allIndexes) {
      lines.push(idx);
    }
    lines.push('');
  }

  // updated_at trigger function + per-table triggers
  if (tablesWithUpdatedAt.length > 0) {
    lines.push('-- --------------------------------------------------------------------------');
    lines.push('-- TRIGGERS: auto-update updated_at');
    lines.push('-- --------------------------------------------------------------------------');
    lines.push('');
    lines.push(`CREATE OR REPLACE FUNCTION update_updated_at_column()`);
    lines.push(`RETURNS TRIGGER AS $$`);
    lines.push(`BEGIN`);
    lines.push(`  NEW.updated_at = now();`);
    lines.push(`  RETURN NEW;`);
    lines.push(`END;`);
    lines.push(`$$ language 'plpgsql';`);
    lines.push('');

    for (const tbl of tablesWithUpdatedAt) {
      lines.push(`CREATE TRIGGER update_${tbl}_updated_at`);
      lines.push(`  BEFORE UPDATE ON "${tbl}"`);
      lines.push(`  FOR EACH ROW`);
      lines.push(`  EXECUTE FUNCTION update_updated_at_column();`);
      lines.push('');
    }
  }

  // ---- Write file ----
  const outDir = path.resolve(__dirname, '..', 'docs', 'database');
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, 'supabase_schema.sql');
  fs.writeFileSync(outFile, lines.join('\n'), 'utf-8');

  // ---- Console summary ----
  console.log('✅  Supabase SQL schema generated successfully!');
  console.log(`    Tables:   ${tableStatements.length}`);
  console.log(`    Indexes:  ${allIndexes.length}`);
  console.log(`    Triggers: ${tablesWithUpdatedAt.length}`);
  console.log(`    Output:   ${outFile}`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
generate();
