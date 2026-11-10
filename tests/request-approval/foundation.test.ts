// Baseline-loadable tripwires: collect on FULL55, fail assertions there for the
// absent request-approval path, pass here. No DB required.
import { it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

it("change request actions exist with the control boundary", () => {
  expect(existsSync("src/app/actions/change-requests.ts")).toBe(true);
  const src = readFileSync("src/app/actions/change-requests.ts", "utf8");
  for (const fn of ["requestSaleRemarksEdit", "listChangeRequests", "decideChangeRequest", "cancelChangeRequest"]) {
    expect(src).toContain(`export async function ${fn}`);
  }
  expect(src).toContain("requireControlActor");
  expect(src).toContain("requireActor");
  expect(src).toContain("idempotencyKey");
  expect(src).toContain("CONFLICT");
  expect(src).toMatch(/cannot approve or reject your own request/);
});

it("change_requests table is a local-only migration-007 model", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  expect(schema).toContain("model ChangeRequest");
  const index = readFileSync("src/lib/migrations/index.ts", "utf8");
  expect(index).toContain("007_change_requests");
  expect(existsSync("src/lib/migrations/definitions/007_change_requests.ts")).toBe(true);
  expect(readFileSync("scripts/generate-sync-map.js", "utf8")).toContain("'ChangeRequest'");
  expect(readFileSync("scripts/generate-supabase-sql.js", "utf8")).toContain("'ChangeRequest'");
});

it("legacy direct sale edit cannot bypass the request path once enrolled", () => {
  // FULL60: the tripwire now pins the wider contract - post-enrollment ANY
  // direct edit (not only remarks) and any direct delete must route through
  // the request-approval path, and the legacy delete trail is fail-closed.
  const sales = readFileSync("src/app/actions/sales.ts", "utf8");
  expect(sales).toContain("isEnrollmentComplete");
  expect(sales).toMatch(/Sale edits require an approved change request/);
  expect(sales).toMatch(/Deleting a sale requires an approved change request/);
  // FULL74: the bulk purge route is retired outright (deliberate, disclosed
  // replacement of the FULL62 post-enrollment gate): the source must refuse in
  // every state and must never reach a delete.
  expect(sales).toMatch(/Bulk purge of sales has been retired/);
  const purgeBody = sales.slice(sales.indexOf("export async function purgeNonGstSales"));
  expect(purgeBody).not.toContain("deleteMany");
});

it("UI wires the request dialog and the requests panel", () => {
  expect(existsSync("src/components/sale-remarks-request-dialog.tsx")).toBe(true);
  expect(existsSync("src/components/change-requests-panel.tsx")).toBe(true);
  const page = readFileSync("src/components/modules/sales-page.tsx", "utf8");
  expect(page).toContain("SaleRemarksRequestDialog");
  expect(page).toContain("ChangeRequestsPanel");
  // FULL62: the filing UI exists and is wired into the sales page.
  expect(existsSync("src/components/sale-edit-request-dialog.tsx")).toBe(true);
  expect(existsSync("src/components/sale-delete-request-dialog.tsx")).toBe(true);
  expect(page).toContain("SaleEditRequestDialog");
  expect(page).toContain("SaleDeleteRequestDialog");
  expect(page).toContain("isEnrollmentComplete");
});

it("database import/export routes consult the restart barrier", () => {
  for (const f of ["src/app/api/database/import/route.ts", "src/app/api/database/export/route.ts"]) {
    expect(readFileSync(f, "utf8"), f).toContain("assertRestartNotRequired");
  }
});

// FULL57 correction tripwires: collect on FULL56, fail there, pass here.
it("migration 008 adds the record-context fingerprint column additively", () => {
  const index = readFileSync("src/lib/migrations/index.ts", "utf8");
  expect(index).toContain("008_change_request_fingerprint");
  const def = readFileSync("src/lib/migrations/definitions/008_change_request_fingerprint.ts", "utf8");
  expect(def).toContain("ALTER TABLE");
  expect(def).toContain("record_fingerprint");
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  expect(schema).toContain("recordFingerprint");
});

it("idempotency replay is bound to requester, target, operation, proposal and reason", () => {
  const src = readFileSync("src/app/actions/change-requests.ts", "utf8");
  expect(src).toContain("already used for a different request");
  expect(src).toContain("existing.requestedById === requestedById");
  expect(src).toContain("existing.entityId === saleId");
  expect(src).toContain("existing.proposedValue === input.proposedRemarks");
  expect(src).toContain("existing.reason === reason");
});

it("null and empty remarks are normalized and record state is fingerprinted", () => {
  const src = readFileSync("src/app/actions/change-requests.ts", "utf8");
  expect(src).toContain("normalizeRemarks");
  expect(src).toContain("fingerprintOutgoingSale");
  const fp = readFileSync("src/lib/domain/change-requests/fingerprint.ts", "utf8");
  expect(fp).toContain("sha256");
  expect(fp).not.toContain("updatedAt\",");
  expect(fp).not.toContain("Object.keys(");
});
