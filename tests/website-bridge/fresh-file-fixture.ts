import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// setupFiles runs before each test file, not once for the whole suite.
// Set DATABASE_URL before any test imports create a Prisma client.
const parent = process.env.MBM_BRIDGE_TEST_ROOT;
const ddl = process.env.MBM_BRIDGE_FIXTURE_SQL;
if (!parent || !ddl || !fs.existsSync(ddl)) {
  throw Error('Use unshare -Urn node tests/website-bridge/runner.mjs for isolated synthetic fixtures.');
}
const dir = fs.mkdtempSync(path.join(parent, 'file-'));
process.env.DATABASE_URL = `file:${dir}/fixture.db`;
process.env.MBM_TEST_ROOT = dir;
const result = spawnSync(process.execPath, [
  path.resolve('node_modules/prisma/build/index.js'), 'db', 'execute',
  '--file', ddl, '--url', process.env.DATABASE_URL,
], { encoding: 'utf8', env: process.env });
if (result.status !== 0) throw Error(`Could not create synthetic bridge fixture: ${result.stderr}`);
