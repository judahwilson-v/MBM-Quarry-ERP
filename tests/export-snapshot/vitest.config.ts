import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: { fileParallelism: false, include: ["tests/export-snapshot/**/*.test.ts"], testTimeout: 120000 },
  resolve: { alias: { "@": path.resolve(__dirname, "../../src") } },
});
