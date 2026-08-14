/**
 * generate-bootstrap-ddl.js
 *
 * Auto-generates SQLite DDL (CREATE TABLE / CREATE INDEX statements) from
 * Prisma's DMMF so that bootstrap.ts no longer needs hand-maintained SQL.
 *
 * THIS IS THE SINGLE SOURCE OF TRUTH for SQLite DDL — generated from
 * prisma/schema.prisma via Prisma's DMMF metadata.
 *
 * Handles:
 *   - All scalar field types (String, Int, Float, Boolean, DateTime, Json, BigInt)
 *   - @id, @unique, @map, @@map annotations
 *   - @default(uuid/cuid/now/autoincrement/dbgenerated) and literal defaults
 *   - @updatedAt → DEFAULT CURRENT_TIMESTAMP
 *   - @relation with onDelete: Cascade → FOREIGN KEY constraints
 *   - Foreign-key indexes for _id columns
 *   - Performance indexes for common query patterns (date, name, status columns)
 *
 * Usage:
 *   node scripts/generate-bootstrap-ddl.js
 *
 * Output:
 *   src/lib/generated/bootstrap-ddl.json
 */

const { Prisma } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Prisma → SQLite type mapping
// ---------------------------------------------------------------------------
const TYPE_MAP = {
  String: 'TEXT',
  Int: 'INTEGER',
  Float: 'REAL',
  Boolean: 'BOOLEAN',
  DateTime: 'DATETIME',
  Json: 'JSON',
  BigInt: 'INTEGER',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a Prisma scalar type to its SQLite equivalent.
 */
function mapType(prismaType) {
  return TYPE_MAP[prismaType] || 'TEXT';
}

/**
 * Build the DEFAULT clause for a column, or return an empty string when the
 * default is handled at the application level (e.g. uuid / cuid).
 *
 * Returns an object: { clause: string, isAutoincrement: boolean }
 */
function resolveDefault(field) {
  const defaultSpec = field.hasDefaultValue ? field.default : null;

  // @updatedAt fields get DEFAULT CURRENT_TIMESTAMP so that raw SQL inserts
  // don't hit NOT NULL constraints.
  if (field.isUpdatedAt) {
    return { clause: 'DEFAULT CURRENT_TIMESTAMP', isAutoincrement: false };
  }

  if (defaultSpec === undefined || defaultSpec === null) {
    return { clause: '', isAutoincrement: false };
  }

  // Function-style defaults: { name: '...', args: [] }
  if (typeof defaultSpec === 'object' && defaultSpec.name) {
    switch (defaultSpec.name) {
      case 'uuid':
      case 'cuid':
        // Application-generated — no SQLite default
        return { clause: '', isAutoincrement: false };
      case 'now':
        return { clause: 'DEFAULT CURRENT_TIMESTAMP', isAutoincrement: false };
      case 'autoincrement':
        return { clause: '', isAutoincrement: true };
      case 'dbgenerated': {
        // Extract the value from dbgenerated args, e.g. @default(dbgenerated("'1970-01-01 00:00:00'"))
        // or @default(dbgenerated("'default'"))
        if (defaultSpec.args && defaultSpec.args.length > 0) {
          const raw = defaultSpec.args[0];
          // The arg is a SQL expression string, use it directly as DEFAULT
          return { clause: `DEFAULT ${raw}`, isAutoincrement: false };
        }
        return { clause: '', isAutoincrement: false };
      }
      default:
        return { clause: '', isAutoincrement: false };
    }
  }

  // Literal defaults
  if (typeof defaultSpec === 'number') {
    return { clause: `DEFAULT ${defaultSpec}`, isAutoincrement: false };
  }
  if (typeof defaultSpec === 'boolean') {
    // Use 0/1 for SQLite boolean consistency
    return { clause: `DEFAULT ${defaultSpec ? 1 : 0}`, isAutoincrement: false };
  }
  if (typeof defaultSpec === 'string') {
    // Escape single quotes inside the string value
    const escaped = defaultSpec.replace(/'/g, "''");
    return { clause: `DEFAULT '${escaped}'`, isAutoincrement: false };
  }

  return { clause: '', isAutoincrement: false };
}

/**
 * Build a full column definition string for a single scalar field.
 */
function buildColumnDef(field) {
  const columnName = field.dbName || field.name;
  const { clause: defaultClause, isAutoincrement } = resolveDefault(field);

  // Autoincrement columns use a special composite type + constraint syntax
  if (isAutoincrement) {
    return `${columnName} INTEGER PRIMARY KEY AUTOINCREMENT`;
  }

  const parts = [columnName, mapType(field.type)];

  if (field.isId) {
    parts.push('PRIMARY KEY');
  }

  if (field.isRequired) {
    parts.push('NOT NULL');
  }

  if (field.isUnique && !field.isId) {
    parts.push('UNIQUE');
  }

  if (defaultClause) {
    parts.push(defaultClause);
  }

  return parts.join(' ');
}

/**
 * Build FOREIGN KEY constraints for a model by inspecting its relation fields.
 * Only generates FK for relations with onDelete: Cascade.
 */
function buildForeignKeys(model, allModels) {
  const fks = [];

  for (const field of model.fields) {
    if (field.kind !== 'object') continue;
    if (!field.relationFromFields || field.relationFromFields.length === 0) continue;
    if (field.relationOnDelete !== 'Cascade') continue;

    const fromFieldName = field.relationFromFields[0];
    // Find the scalar field to get its db column name
    const scalarField = model.fields.find(f => f.name === fromFieldName);
    if (!scalarField) continue;

    const columnName = scalarField.dbName || scalarField.name;

    // Find the target model to get its table name
    const targetModel = allModels.find(m => m.name === field.type);
    if (!targetModel) continue;

    const targetTable = targetModel.dbName || targetModel.name.toLowerCase();

    fks.push(`FOREIGN KEY (${columnName}) REFERENCES ${targetTable}(id) ON DELETE CASCADE`);
  }

  return fks;
}

// ---------------------------------------------------------------------------
// Performance indexes — these go beyond FK indexes to cover common query
// patterns. They are derived from the column naming conventions in the project.
// ---------------------------------------------------------------------------

/**
 * Generate performance indexes for common query patterns.
 * These cover: date columns, name/status columns, and composite indexes.
 */
function generatePerformanceIndexes(tableName, model) {
  const indexes = [];
  const scalarFields = model.fields.filter(f => f.kind === 'scalar');

  for (const field of scalarFields) {
    const colName = field.dbName || field.name;

    // Skip primary key and already-covered FK indexes (_id suffix)
    if (field.isId) continue;
    if (colName.endsWith('_id')) continue; // FK indexes are generated separately

    // Index date/datetime columns used for filtering (except created_at/updated_at
    // which are less commonly queried alone, UNLESS the table is an event/log table)
    const isEventTable = ['financial_events', 'ledger_entries', 'audit_logs',
      'employee_ledgers', 'party_ledger', 'inventory_transactions'].includes(tableName);

    if (field.type === 'DateTime') {
      // Always index explicit date columns (sale_date, date, entry_date, etc.)
      if (!['created_at', 'updated_at'].includes(colName)) {
        indexes.push(
          `CREATE INDEX IF NOT EXISTS ${tableName}_${colName}_idx ON ${tableName} (${colName})`
        );
      }
      // Index created_at on event/log tables
      if (colName === 'created_at' && isEventTable) {
        indexes.push(
          `CREATE INDEX IF NOT EXISTS ${tableName}_${colName}_idx ON ${tableName} (${colName})`
        );
      }
    }

    // Index commonly queried text columns
    if (field.type === 'String' && !field.isUnique) {
      // Status columns
      if (colName === 'status' || colName === 'action') {
        indexes.push(
          `CREATE INDEX IF NOT EXISTS ${tableName}_${colName}_idx ON ${tableName} (${colName})`
        );
      }
      // Name columns (party_name, employee_name, vehicle_number, etc.)
      if (colName.endsWith('_name') || colName === 'vehicle_number') {
        indexes.push(
          `CREATE INDEX IF NOT EXISTS ${tableName}_${colName}_idx ON ${tableName} (${colName})`
        );
      }
      // Event type columns
      if (colName === 'event_type' || colName === 'entity_type') {
        indexes.push(
          `CREATE INDEX IF NOT EXISTS ${tableName}_${colName}_idx ON ${tableName} (${colName})`
        );
      }
    }
  }

  // Composite indexes for event/log tables
  if (tableName === 'financial_events' || tableName === 'ledger_entries') {
    indexes.push(
      `CREATE INDEX IF NOT EXISTS ${tableName}_entity_type_entity_id_idx ON ${tableName} (entity_type, entity_id)`
    );
  }
  if (tableName === 'audit_logs') {
    indexes.push(
      `CREATE INDEX IF NOT EXISTS ${tableName}_entity_name_entity_id_idx ON ${tableName} (entity_name, entity_id)`
    );
  }

  return indexes;
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

function generateBootstrapDDL() {
  const models = Prisma.dmmf.datamodel.models;
  const tables = {};
  const indexes = [];

  for (const model of models) {
    const tableName = model.dbName || model.name.toLowerCase();
    const columns = [];

    for (const field of model.fields) {
      // Only process scalar fields — skip relations and enums
      if (field.kind !== 'scalar') continue;

      columns.push(buildColumnDef(field));
    }

    if (columns.length === 0) continue;

    // Build foreign key constraints
    const foreignKeys = buildForeignKeys(model, models);

    // Build the full CREATE TABLE with columns + FK constraints
    const allParts = [...columns, ...foreignKeys];
    tables[tableName] = `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${allParts.join(',\n  ')}\n)`;

    // Generate FK indexes for foreign-key columns (_id suffix, non-PK)
    for (const field of model.fields) {
      if (field.kind !== 'scalar') continue;

      const columnName = field.dbName || field.name;
      if (columnName.endsWith('_id') && !field.isId) {
        indexes.push(
          `CREATE INDEX IF NOT EXISTS ${tableName}_${columnName}_idx ON ${tableName} (${columnName})`
        );
      }
    }

    // Generate performance indexes
    const perfIndexes = generatePerformanceIndexes(tableName, model);
    indexes.push(...perfIndexes);
  }

  // Ensure the output directory exists
  const outputDir = path.join(__dirname, '..', 'src', 'lib', 'generated');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`[Bootstrap DDL Generator] Created output directory: ${outputDir}`);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    tables,
    indexes,
  };

  const outputPath = path.join(outputDir, 'bootstrap-ddl.json');
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

  console.log(
    `[Bootstrap DDL Generator] Generated DDL for ${Object.keys(tables).length} tables and ${indexes.length} indexes.`,
  );
  console.log(`[Bootstrap DDL Generator] Output written to: ${outputPath}`);
}

generateBootstrapDDL();
