import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { include: ["tests/settings-read-split/**/*.test.ts"], testTimeout: 60000 },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../../src") } },
});
