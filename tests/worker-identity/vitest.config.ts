import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: { fileParallelism: false, include: ["tests/worker-identity/**/*.test.ts"], testTimeout: 60000 },
  resolve: { alias: { "@": path.resolve(__dirname, "../../src") } },
});
