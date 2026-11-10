import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { include: ["tests/worker-identity/foundation.test.ts"], testTimeout: 60000 },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../../src") } },
});
