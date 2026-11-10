import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
  test: { setupFiles: ['tests/website-bridge/fresh-file-fixture.ts'], fileParallelism: false, include: ['tests/website-bridge/**/*.test.ts'], testTimeout: 60000 },
  resolve: { alias: { '@': path.resolve(__dirname, '../../src') } },
});
