// Baseline-loadable tripwires: collect on FULL53, fail assertions there for the
// absent split, pass here. No DB required.
import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as settings from "@/app/actions/settings";
import * as auth from "@/app/actions/auth";
it("public settings reader and server-side admin verification exist", () => {
  const s = settings as unknown as Record<string, unknown>;
  const a = auth as unknown as Record<string, unknown>;
  expect(typeof s.getPublicSettings).toBe("function");
  expect(typeof s.getGlobalSettings).toBe("undefined");
  expect(typeof a.verifyAdminPin).toBe("function");
});
it("no client component receives the expected admin PIN or raw settings", () => {
  const adminPage = readFileSync("src/app/admin/page.tsx", "utf8");
  expect(adminPage).not.toContain("expectedPin");
  expect(adminPage).not.toContain("getGlobalSettings");
  const dashboard = readFileSync("src/app/admin/admin-dashboard.tsx", "utf8");
  expect(dashboard).not.toContain("expectedPin");
  expect(dashboard).toContain("verifyAdminPin");
});
it("pages and shell read only the public settings action", () => {
  for (const f of ["src/app/page.tsx", "src/app/weighbridge/page.tsx", "src/app/settings/general/page.tsx", "src/components/app-shell.tsx"]) {
    const t = readFileSync(f, "utf8");
    expect(t, f).toContain("getPublicSettings");
    expect(t, f).not.toContain("getGlobalSettings");
  }
});
it("raw settings reader is not exported from a use-server module", () => {
  const internal = readFileSync("src/lib/settings/internal.ts", "utf8");
  expect(internal.split("\n").filter(l => l.trim() === '"use server"' || l.trim() === "'use server'")).toHaveLength(0);
  const actions = readFileSync("src/app/actions/settings.ts", "utf8");
  expect(actions).not.toMatch(/export async function getGlobalSettings/);
  const sec = readFileSync("src/app/settings/general/security-settings.tsx", "utf8");
  expect(sec).not.toContain("initialSettings?.adminPin");
  expect(sec).not.toContain("initialSettings?.deletePin");
});
