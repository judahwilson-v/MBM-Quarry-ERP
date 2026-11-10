// Baseline-loadable acceptance tripwires. Unlike the full runtime suite these
// collect on FULL50 and fail assertions for the absent foundation, rather than
// counting a missing-module collection error as test failures.
import { it, expect } from "vitest";
import * as auth from "@/app/actions/auth";
import { ALL_MIGRATIONS } from "@/lib/migrations";
import { readFileSync } from "node:fs";
it("server identity and control boundaries exist", () => {
  const api = auth as unknown as Record<string, unknown>;
  expect(typeof api.requireActor).toBe("function");
  expect(typeof api.resolveActor).toBe("function");
  expect(typeof api.requirePrivilegedActor).toBe("function");
});
it("identity migration is registered as additive version 6", () => {
  expect(ALL_MIGRATIONS.some(m => m.id === "006_worker_identity" && m.version === 6)).toBe(true);
});
it("all three local identity models are declared", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  for (const name of ["AppUser", "AuthSession", "AppMeta"]) expect(schema.includes(`model ${name} {`)).toBe(true);
});
