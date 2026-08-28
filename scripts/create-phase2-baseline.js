#!/usr/bin/env node
/**
 * One-time Phase 2 baseline materializer.
 *
 * It copies the current, generated Postgres schema contract into the already
 * created Supabase migration file. The resulting SQL is static and committed:
 * no application startup or migration execution calls this script.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'docs', 'database', 'supabase_schema.sql');
const migrationDir = path.join(root, 'supabase', 'migrations');
const requestedOutput = process.argv[2];
const target = requestedOutput
  ? path.resolve(root, requestedOutput)
  : fs.readdirSync(migrationDir)
      .filter((name) => name.endsWith('_phase2_baseline_schema_contract.sql'))
      .sort()
      .map((name) => path.join(migrationDir, name))
      .at(-1);

if (!target || !fs.existsSync(source)) {
  throw new Error('Expected Phase 2 migration target and docs/database/supabase_schema.sql.');
}

const syncStateTable = `
CREATE TABLE IF NOT EXISTS "sync_state" (
  "id" TEXT DEFAULT 'default' PRIMARY KEY,
  "last_synced_at" TIMESTAMPTZ DEFAULT '1970-01-01 00:00:00+00' NOT NULL,
  "status" TEXT DEFAULT 'IDLE' NOT NULL,
  "last_error" TEXT,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);
`;

let sql = fs.readFileSync(source, 'utf8');
sql = sql.replace(/^-- =+\r?\n-- AUTO-GENERATED[^\n]*\r?\n-- Generated at:[^\n]*\r?\n-- =+\r?\n/, '');
sql = sql.replace(/\r\n/g, '\n');
sql = sql.replace('\n-- --------------------------------------------------------------------------\n-- INDEXES', `${syncStateTable}\n-- --------------------------------------------------------------------------\n-- INDEXES`);

const header = `-- Phase 2 PostgreSQL schema baseline\n-- Frozen snapshot of the MBM Prisma/Postgres contract on 2026-08-27.\n-- Generated once by scripts/create-phase2-baseline.js; do not regenerate during normal builds.\n-- Existing cloud projects must record this migration as a baseline, not reapply it.\n-- Live-cloud timestamp and weighbridge nullability deviations are documented in\n-- supabase/schema-contract-deviations.json and deliberately remain unchanged in Phase 2.\n\n`;
fs.writeFileSync(target, header + sql, 'utf8');
console.log(`Wrote immutable Phase 2 baseline: ${target}`);
