import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { include: ["tests/restore-control/foundation.test.ts"], testTimeout: 60000 },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../../src") } },
});
