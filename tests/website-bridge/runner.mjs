import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Each Vitest file owns a fresh synthetic DB. The retained independent suite
// intentionally repeats earlier cases and must not share their identity keys.
const root = process.cwd();
if (fs.readFileSync('/proc/net/route', 'utf8').trim().split('\n').length > 1) {
  throw Error('Network namespace required: run unshare -Urn node tests/website-bridge/runner.mjs');
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mbm-website-bridge-'));
const env = {
  PATH: process.env.PATH, HOME: tmp, TMPDIR: tmp,
  TZ: process.env.TZ || 'Asia/Kolkata',
  NODE_OPTIONS: '--require=' + root + '/tests/money-correctness/network-deny.cjs',
  DATABASE_URL: `file:${tmp}/unused.db`,
  MBM_BRIDGE_TEST_ROOT: tmp, MBM_BRIDGE_FIXTURE_SQL: path.join(tmp, 'fixture.sql'),
};
function run(script, args, print = false) {
  const result = spawnSync(process.execPath, [path.resolve(script), ...args], { cwd: root, env, encoding: 'utf8' });
  if (print || result.status !== 0) { process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || ''); }
  if (result.status !== 0) throw Error(`Bridge check failed: ${script} (${result.status})`);
  return result.stdout;
}
try {
  const ddl = run('node_modules/prisma/build/index.js', ['migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script']);
  fs.writeFileSync(env.MBM_BRIDGE_FIXTURE_SQL, ddl);
  run('node_modules/vitest/vitest.mjs', ['run', '--config', 'tests/website-bridge/vitest.config.ts'], true);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
