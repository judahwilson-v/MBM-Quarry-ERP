// Baseline-loadable tripwires: collect on FULL54, fail assertions there for the
// absent control gate / identity preservation, pass here. No DB required.
import { it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

it("control-plane gate module exists and is wired into admin and database actions", () => {
  expect(existsSync("src/lib/identity/control.ts")).toBe(true);
  const control = readFileSync("src/lib/identity/control.ts", "utf8");
  expect(control).toContain("requireControlActor");
  expect(control).toContain("requirePrivilegedActor");
  for (const f of ["src/app/actions/admin.ts", "src/app/actions/database.ts"]) {
    expect(readFileSync(f, "utf8"), f).toContain("requireControlActor");
  }
  const sync = readFileSync("src/app/actions/sync.ts", "utf8");
  expect(sync).toContain("requireControlActor");
});

it("restore and admin entrypoints accept a session token and gate on it", () => {
  const db = readFileSync("src/app/actions/database.ts", "utf8");
  expect(db).toMatch(/restoreLocalBackup\(filename: string, sessionToken\?: string \| null\)/);
  expect(db).toMatch(/createLocalBackup\(sessionToken\?: string \| null\)/);
  expect(db).toMatch(/listLocalBackups\(sessionToken\?: string \| null\)/);
  const admin = readFileSync("src/app/actions/admin.ts", "utf8");
  expect(admin).toMatch(/forceSync\(sessionToken\?: string \| null\)/);
  expect(admin).toMatch(/getDatabaseInfo\(sessionToken\?: string \| null\)/);
  expect(admin).toMatch(/getSupabaseStorageUsage\(sessionToken\?: string \| null\)/);
  expect(admin).toMatch(/triggerSupabaseDataPurge\(sessionToken\?: string \| null\)/);
  const sync = readFileSync("src/app/actions/sync.ts", "utf8");
  expect(sync).toMatch(/performFullRestore\(options\?: \{ force\?: boolean; acknowledgeUnsynced\?: boolean \}, sessionToken\?: string \| null\)/);
  expect(sync).toMatch(/checkRestoreEligibility\(sessionToken\?: string \| null\)/);
  expect(sync).toMatch(/fetchRestoreDiffSummary\(sessionToken\?: string \| null\)/);
  expect(sync).toMatch(/fetchDetailedTableDiff\(tableName: string, sessionToken\?: string \| null\)/);
});

it("identity preservation helper exists and is used by both restore paths", () => {
  expect(existsSync("src/lib/identity/preserve.ts")).toBe(true);
  const preserve = readFileSync("src/lib/identity/preserve.ts", "utf8");
  expect(preserve).toContain("snapshotIdentity");
  expect(preserve).toContain("applyIdentitySnapshot");
  expect(preserve).toContain("hasIdentityRows");
  const local = readFileSync("src/app/actions/database.ts", "utf8");
  expect(local).toContain("snapshotIdentity");
  expect(local).toContain("applyIdentitySnapshot");
  const staged = readFileSync("src/lib/sync/staged-restore.ts", "utf8");
  expect(staged).toContain("snapshotIdentity");
  expect(staged).toContain("applyIdentitySnapshot");
});

it("database import/export API routes are gated and import uses the safe restore path", () => {
  const imp = readFileSync("src/app/api/database/import/route.ts", "utf8");
  expect(imp).toContain("requireControlActor");
  expect(imp).toContain("restoreLocalBackup");
  expect(imp).not.toContain("fs.writeFileSync(dbPath");
  const exp = readFileSync("src/app/api/database/export/route.ts", "utf8");
  expect(exp).toContain("requireControlActor");
});

it("UI callers forward the session token to control entrypoints", () => {
  for (const f of [
    "src/components/backup-manager.tsx",
    "src/app/admin/admin-dashboard.tsx",
    "src/components/storage-indicator.tsx",
    "src/app/settings/sync/page.tsx",
    "src/components/sync/TableDiffViewer.tsx",
  ]) {
    expect(readFileSync(f, "utf8"), f).toContain("getSessionToken");
  }
});
