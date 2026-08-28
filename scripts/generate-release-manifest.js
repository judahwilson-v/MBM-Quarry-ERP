#!/usr/bin/env node
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const list = (directory, matcher) => fs.existsSync(directory)
  ? fs.readdirSync(directory).filter(matcher).sort()
  : [];

const sqliteDir = path.join(root, 'src', 'lib', 'migrations', 'definitions');
const postgresDir = path.join(root, 'supabase', 'migrations');
const sqliteMigrations = list(sqliteDir, (name) => /^\d{3}_.+\.ts$/.test(name));
const postgresMigrations = list(postgresDir, (name) => /^\d{14}_.+\.sql$/.test(name));

if (sqliteMigrations.length === 0 || postgresMigrations.length === 0) {
  throw new Error('Both SQLite and Supabase migration directories must contain committed migrations.');
}

const manifest = {
  version: 1,
  sqlite: {
    latestMigration: sqliteMigrations.at(-1).replace(/\.ts$/, ''),
    migrationChecksums: Object.fromEntries(sqliteMigrations.map((name) => [name.replace(/\.ts$/, ''), sha256(path.join(sqliteDir, name))])),
  },
  postgres: {
    latestMigration: postgresMigrations.at(-1).replace(/\.sql$/, ''),
    migrationChecksums: Object.fromEntries(postgresMigrations.map((name) => [name.replace(/\.sql$/, ''), sha256(path.join(postgresDir, name))])),
  },
  prismaSchemaChecksum: sha256(path.join(root, 'prisma', 'schema.prisma')),
  prismaPostgresSchemaChecksum: sha256(path.join(root, 'prisma', 'schema_pg.prisma')),
  deviationsChecksum: sha256(path.join(root, 'supabase', 'schema-contract-deviations.json')),
};

const output = path.join(root, 'supabase', 'release-manifest.json');
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
if (process.argv.includes('--verify')) {
  if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== serialized) {
    throw new Error('Release manifest is stale. Run node scripts/generate-release-manifest.js and commit the result.');
  }
  console.log('Release manifest integrity verified.');
} else {
  fs.writeFileSync(output, serialized, 'utf8');
  console.log(`Release manifest written: ${output}`);
}
