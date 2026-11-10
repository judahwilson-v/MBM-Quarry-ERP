import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: { fileParallelism: false, include: ["tests/backup-snapshot/**/*.test.ts"], testTimeout: 120000 },
  resolve: { alias: { "@": path.resolve(__dirname, "../../src") } },
});
