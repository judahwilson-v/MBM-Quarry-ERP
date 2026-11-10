// Request-approval (remarks-only) acceptance suite for FULL56.
// PIN fixture policy: every PIN below is generated at random per run
// (crypto-based), never a real or reused credential, and never logged.
import { describe, it, expect, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Fault-injection hook for the audit fail-closed test: when the flag is set,
// the audit write throws, which must roll back the ENTIRE apply transaction.
vi.mock("@/lib/domain", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    writeAuditEvent: (...args: any[]) => {
      if ((globalThis as any).__forceAuditFail) throw new Error("forced audit failure");
      if ((globalThis as any).__forceAuditPrismaText) {
        (globalThis as any).__forceAuditPrismaText = false;
        throw new Error("Invalid `prisma.auditLog.create()` invocation: Foreign key constraint violated on the foreign key");
      }
      return actual.writeAuditEvent(...args);
    },
  };
});

import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { requestSaleRemarksEdit, requestSaleFieldEdit, listChangeRequests, decideChangeRequest, cancelChangeRequest } from "@/app/actions/change-requests";
import { saveSale } from "@/app/actions/sales";
import { updateGlobalSettings } from "@/app/actions/settings";
import { hashPin, newSessionToken, ENROLLMENT_KEY, CONTROL_PRINCIPAL_KEY } from "@/lib/identity/service";

const genPin = () => crypto.randomInt(100000, 999999).toString();
const RUN = crypto.randomBytes(3).toString("hex");
const prisma = new PrismaClient();
const key = () => crypto.randomUUID();

let materialId = "";
async function makeSale(remarks: string): Promise<string> {
  const sale = await prisma.outgoingSale.create({
    data: {
      saleDate: new Date("2026-01-05"),
      bookNumber: crypto.randomInt(1, 100000),
      pageNumber: crypto.randomInt(1, 100000),
      vehicleNumber: `KL-${RUN}-${crypto.randomInt(1000, 9999)}`,
      partyName: `P-${RUN}`,
      materialId,
      materialName: `M-${RUN}`,
      ratePerCft: 50,
      qty: 10,
      discountType: "fixed",
      discountValue: 0,
      amount: 500,
      finalAmount: 500,
      remarks,
    },
  });
  return sale.id;
}

async function makeSession(userId: string, ttlMs = 60 * 60 * 1000): Promise<string> {
  const token = newSessionToken();
  await prisma.authSession.create({ data: { userId, token, expiresAt: new Date(Date.now() + ttlMs) } });
  return token;
}

let principalId = "";
let workerId = "";
let worker2Id = "";
let principalToken = "";
let workerToken = "";
let worker2Token = "";
const WORKER_PIN = genPin();
let settingsAdminPin = genPin();

describe("unenrolled install", () => {
  it("files a request in setup compatibility mode without mutating the record", async () => {
    const m = await prisma.material.create({ data: { materialName: `M-${RUN}`, ratePerCft: 50 } });
    materialId = m.id;
    const saleId = await makeSale("original remarks");
    const result = await requestSaleRemarksEdit({ saleId, proposedRemarks: "new remarks", reason: "typo fix", idempotencyKey: key() }, null);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.request.requestedByName).toBe("setup");
      expect(result.request.status).toBe("PENDING");
    }
    const sale = await prisma.outgoingSale.findUnique({ where: { id: saleId } });
    expect(sale?.remarks).toBe("original remarks"); // record unchanged while pending
    const audit = await prisma.auditLog.findFirst({ where: { entityName: "ChangeRequest" } });
    expect(audit).toBeTruthy(); // fail-closed request audit exists
  });

  it("refuses in a production build without enrollment", async () => {
    const saleId = await makeSale("x");
    const savedEnv = { NODE_ENV: process.env.NODE_ENV, MBM_TEST_ROOT: process.env.MBM_TEST_ROOT };
    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      delete process.env.MBM_TEST_ROOT;
      const result = await requestSaleRemarksEdit({ saleId, proposedRemarks: "y", reason: "r", idempotencyKey: key() }, null);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.message).toMatch(/enrollment is not configured/i);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = savedEnv.NODE_ENV;
      if (savedEnv.MBM_TEST_ROOT === undefined) delete process.env.MBM_TEST_ROOT;
      else process.env.MBM_TEST_ROOT = savedEnv.MBM_TEST_ROOT;
    }
  });
});

describe("enrolled install: request-approval lifecycle", () => {
  it("seeds enrollment, settings PIN and sessions", async () => {
    await updateGlobalSettings({ adminPin: settingsAdminPin, deletePin: genPin() } as any);
    const { hash, salt } = hashPin(WORKER_PIN);
    const principal = await prisma.appUser.create({ data: { name: `Owner-${RUN}`, pinHash: hash, pinSalt: salt, role: "owner" } });
    const worker = await prisma.appUser.create({ data: { name: `Worker-${RUN}`, pinHash: hash, pinSalt: salt } });
    const worker2 = await prisma.appUser.create({ data: { name: `Worker2-${RUN}`, pinHash: hash, pinSalt: salt } });
    await prisma.appMeta.create({ data: { key: ENROLLMENT_KEY, value: "true" } });
    await prisma.appMeta.create({ data: { key: CONTROL_PRINCIPAL_KEY, value: principal.id } });
    principalId = principal.id;
    workerId = worker.id;
    worker2Id = worker2.id;
    principalToken = await makeSession(principalId);
    workerToken = await makeSession(workerId);
    worker2Token = await makeSession(worker2Id);
    expect(principalToken).toBeTruthy();
  });

  let saleId = "";
  let requestId = "";

  it("files a request attributed to the session worker; record stays unchanged", async () => {
    saleId = await makeSale("keep me");
    const result = await requestSaleRemarksEdit({ saleId, proposedRemarks: "changed text", reason: "wrong lorry note", idempotencyKey: key() }, workerToken);
    expect(result.success).toBe(true);
    if (!result.success) return;
    requestId = result.request.id;
    expect(result.request.requestedByName).toBe(`Worker-${RUN}`);
    expect(result.request.originalValue).toBe("keep me");
    expect(result.request.proposedValue).toBe("changed text");
    const sale = await prisma.outgoingSale.findUnique({ where: { id: saleId } });
    expect(sale?.remarks).toBe("keep me");
  });

  it("idempotent retry returns the original request, never a duplicate", async () => {
    const idem = key();
    const first = await requestSaleRemarksEdit({ saleId, proposedRemarks: "another", reason: "r1", idempotencyKey: idem }, workerToken);
    const second = await requestSaleRemarksEdit({ saleId, proposedRemarks: "another", reason: "r1", idempotencyKey: idem }, workerToken);
    expect(first.success && second.success).toBe(true);
    if (first.success && second.success) {
      expect(second.duplicate).toBe(true);
      expect(second.request.id).toBe(first.request.id);
    }
    const count = await prisma.changeRequest.count({ where: { idempotencyKey: idem } });
    expect(count).toBe(1);
    // cancel this extra request so it does not interfere below
    if (first.success) await cancelChangeRequest(first.request.id, workerToken);
  });

  it("an ordinary worker session cannot decide", async () => {
    const result = await decideChangeRequest(requestId, { approve: true }, workerToken);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toMatch(/not configured for this login|Owner-authorized/i);
  });

  it("the principal cannot decide their OWN request (no self-approval)", async () => {
    const own = await requestSaleRemarksEdit({ saleId, proposedRemarks: "self", reason: "mine", idempotencyKey: key() }, principalToken);
    expect(own.success).toBe(true);
    if (!own.success) return;
    const result = await decideChangeRequest(own.request.id, { approve: true }, principalToken);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toMatch(/own request/i);
  });

  it("approval applies atomically with conflict check, audit and trail", async () => {
    const before = await prisma.auditLog.count({ where: { entityName: "Sale", entityId: saleId } });
    const result = await decideChangeRequest(requestId, { approve: true, note: "ok" }, principalToken);
    expect(result.success).toBe(true);
    if (result.success && "request" in result) {
      expect(result.request.status).toBe("APPLIED");
      expect(result.request.decidedByName).toBe(`Owner-${RUN}`);
    }
    const sale = await prisma.outgoingSale.findUnique({ where: { id: saleId } });
    expect(sale?.remarks).toBe("changed text");
    const req = await prisma.changeRequest.findUnique({ where: { id: requestId } });
    expect(req?.appliedAuditId).toBeTruthy();
    const saleAudits = await prisma.auditLog.findMany({ where: { entityName: "Sale", entityId: saleId }, orderBy: { createdAt: "desc" } });
    expect(saleAudits.length).toBe(before + 1);
    const applied = JSON.parse(String(saleAudits[0].payload ?? "{}"));
    expect(applied.before).toEqual({ remarks: "keep me" });
    expect(applied.after).toEqual({ remarks: "changed text" });
  });

  it("replaying a decided request returns the recorded outcome without a second mutation", async () => {
    const before = await prisma.auditLog.count({ where: { entityName: "Sale", entityId: saleId } });
    const result = await decideChangeRequest(requestId, { approve: true }, principalToken);
    expect(result.success).toBe(true);
    if (result.success && "alreadyDecided" in result) expect(result.alreadyDecided).toBe(true);
    expect(await prisma.auditLog.count({ where: { entityName: "Sale", entityId: saleId } })).toBe(before);
    const sale = await prisma.outgoingSale.findUnique({ where: { id: saleId } });
    expect(sale?.remarks).toBe("changed text");
  });

  it("reject keeps the record and retains the denial history", async () => {
    const sid = await makeSale("stay");
    const filed = await requestSaleRemarksEdit({ saleId: sid, proposedRemarks: "go", reason: "test reject", idempotencyKey: key() }, workerToken);
    expect(filed.success).toBe(true);
    if (!filed.success) return;
    const result = await decideChangeRequest(filed.request.id, { approve: false, note: "not justified" }, principalToken);
    expect(result.success).toBe(true);
    const sale = await prisma.outgoingSale.findUnique({ where: { id: sid } });
    expect(sale?.remarks).toBe("stay");
    const req = await prisma.changeRequest.findUnique({ where: { id: filed.request.id } });
    expect(req?.status).toBe("REJECTED");
    expect(req?.decisionNote).toBe("not justified");
    expect(req?.decidedByName).toBe(`Owner-${RUN}`);
  });

  it("requester can cancel their own pending request; another worker cannot", async () => {
    const sid = await makeSale("mine");
    const filed = await requestSaleRemarksEdit({ saleId: sid, proposedRemarks: "x", reason: "test cancel", idempotencyKey: key() }, workerToken);
    expect(filed.success).toBe(true);
    if (!filed.success) return;
    const denied = await cancelChangeRequest(filed.request.id, worker2Token);
    expect(denied.success).toBe(false);
    const ok = await cancelChangeRequest(filed.request.id, workerToken);
    expect(ok.success).toBe(true);
    const req = await prisma.changeRequest.findUnique({ where: { id: filed.request.id } });
    expect(req?.status).toBe("CANCELLED");
  });

  it("stale record at approval marks CONFLICT and applies nothing", async () => {
    const sid = await makeSale("v1");
    const filed = await requestSaleRemarksEdit({ saleId: sid, proposedRemarks: "v2", reason: "test conflict", idempotencyKey: key() }, workerToken);
    expect(filed.success).toBe(true);
    if (!filed.success) return;
    // Record drifts after the request was filed.
    await prisma.outgoingSale.update({ where: { id: sid }, data: { remarks: "drifted" } });
    const result = await decideChangeRequest(filed.request.id, { approve: true }, principalToken);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result as any).conflict).toBe(true);
      expect(result.message).toMatch(/changed after this request/i);
    }
    const sale = await prisma.outgoingSale.findUnique({ where: { id: sid } });
    expect(sale?.remarks).toBe("drifted"); // nothing applied
    const req = await prisma.changeRequest.findUnique({ where: { id: filed.request.id } });
    expect(req?.status).toBe("CONFLICT");
  });

  it("an expired session cannot file or decide", async () => {
    const sid = await makeSale("exp");
    const expiredWorker = await makeSession(workerId, -1000);
    const filed = await requestSaleRemarksEdit({ saleId: sid, proposedRemarks: "y", reason: "expired", idempotencyKey: key() }, expiredWorker);
    expect(filed.success).toBe(false);
    if (!filed.success) expect(filed.message).toMatch(/missing or has expired/i);
    const filedOk = await requestSaleRemarksEdit({ saleId: sid, proposedRemarks: "y", reason: "expired decide", idempotencyKey: key() }, workerToken);
    expect(filedOk.success).toBe(true);
    if (!filedOk.success) return;
    const expiredPrincipal = await makeSession(principalId, -1000);
    const decided = await decideChangeRequest(filedOk.request.id, { approve: true }, expiredPrincipal);
    expect(decided.success).toBe(false);
    if (!decided.success) expect(decided.message).toMatch(/valid login session is required/i);
  });

  it("legacy direct saveSale edit is refused post-enrollment for ANY field, even with a valid PIN", async () => {
    const sid = await makeSale("legacy");
    const input = {
      id: sid,
      saleDate: "2026-01-05",
      bookNumber: "1",
      pageNumber: "1",
      vehicleNumber: `KL-${RUN}-LEG`,
      partyName: `P-${RUN}`,
      materialId,
      ratePerCft: 50,
      qty: 10,
      discountType: "fixed" as const,
      discountValue: 0,
      cashPaid: 0,
      bankPaid: 0,
      gPayPaid: 0,
      remarks: "bypassed",
    };
    const refused = await saveSale(input as any, settingsAdminPin, workerToken);
    expect(refused.success).toBe(false);
    if (!refused.success) expect((refused as any).error ?? (refused as any).message).toMatch(/approved change request/i);
    let sale = await prisma.outgoingSale.findUnique({ where: { id: sid } });
    expect(sale?.remarks).toBe("legacy"); // unchanged
    // FULL60: a non-remarks edit (qty) with unchanged remarks and a valid
    // legacy PIN is refused too - post-enrollment, no direct edit bypasses
    // the approval trail.
    const sameRemarks = await saveSale({ ...input, remarks: "legacy", qty: 11 } as any, settingsAdminPin, workerToken);
    expect(sameRemarks.success).toBe(false);
    if (!sameRemarks.success) expect((sameRemarks as any).error ?? (sameRemarks as any).message).toMatch(/approved change request/i);
    sale = await prisma.outgoingSale.findUnique({ where: { id: sid } });
    expect(Number(sale?.qty)).toBe(10); // unchanged
    expect(sale?.remarks).toBe("legacy");
  });

  it("audit failure rolls back the entire apply (fail-closed trail)", async () => {
    const sid = await makeSale("fault");
    const filed = await requestSaleRemarksEdit({ saleId: sid, proposedRemarks: "applied", reason: "fault test", idempotencyKey: key() }, workerToken);
    expect(filed.success).toBe(true);
    if (!filed.success) return;
    (globalThis as any).__forceAuditFail = true;
    let result;
    try {
      result = await decideChangeRequest(filed.request.id, { approve: true }, principalToken);
    } finally {
      (globalThis as any).__forceAuditFail = false;
    }
    expect(result.success).toBe(false);
    const sale = await prisma.outgoingSale.findUnique({ where: { id: sid } });
    expect(sale?.remarks).toBe("fault"); // mutation rolled back
    const req = await prisma.changeRequest.findUnique({ where: { id: filed.request.id } });
    expect(req?.status).toBe("PENDING"); // transition rolled back
    // And the same approval succeeds once the audit path works again.
    const retry = await decideChangeRequest(filed.request.id, { approve: true }, principalToken);
    expect(retry.success).toBe(true);
    const sale2 = await prisma.outgoingSale.findUnique({ where: { id: sid } });
    expect(sale2?.remarks).toBe("applied");
  });

  it("audit payloads carry no credential material", async () => {
    const audits = await prisma.auditLog.findMany();
    for (const row of audits) {
      expect(row.payload).not.toContain("pinHash");
      expect(row.payload).not.toContain("pinSalt");
      expect(row.payload).not.toContain(WORKER_PIN);
      expect(row.payload).not.toContain(settingsAdminPin);
    }
  });
});

// FULL57 corrections: three defects QA confirmed on FULL56, fixed here.
describe("FULL57 corrections", () => {
  it("a NULL-remarks sale can be requested and approved (null/empty normalized)", async () => {
    const sale = await prisma.outgoingSale.create({
      data: {
        saleDate: new Date("2026-01-05"),
        bookNumber: crypto.randomInt(1, 100000),
        pageNumber: crypto.randomInt(1, 100000),
        vehicleNumber: `KL-${RUN}-N${crypto.randomInt(100, 999)}`,
        partyName: `P-${RUN}`,
        materialId,
        materialName: `M-${RUN}`,
        ratePerCft: 50,
        qty: 10,
        discountType: "fixed",
        discountValue: 0,
        amount: 500,
        finalAmount: 500,
        remarks: null,
      },
    });
    const filed = await requestSaleRemarksEdit({ saleId: sale.id, proposedRemarks: "first remarks", reason: "add note", idempotencyKey: key() }, workerToken);
    expect(filed.success).toBe(true);
    if (!filed.success) return;
    expect(filed.request.originalValue).toBe(""); // normalized, not raw null
    const decided = await decideChangeRequest(filed.request.id, { approve: true }, principalToken);
    expect(decided.success).toBe(true);
    const after = await prisma.outgoingSale.findUnique({ where: { id: sale.id } });
    expect(after?.remarks).toBe("first remarks");
  });

  it("filing the normalized same remarks is still a no-op refusal (null vs empty)", async () => {
    const sale = await prisma.outgoingSale.create({
      data: {
        saleDate: new Date("2026-01-05"),
        bookNumber: crypto.randomInt(1, 100000),
        pageNumber: crypto.randomInt(1, 100000),
        vehicleNumber: `KL-${RUN}-E${crypto.randomInt(100, 999)}`,
        partyName: `P-${RUN}`,
        materialId,
        materialName: `M-${RUN}`,
        ratePerCft: 50,
        qty: 10,
        discountType: "fixed",
        discountValue: 0,
        amount: 500,
        finalAmount: 500,
        remarks: null,
      },
    });
    const filed = await requestSaleRemarksEdit({ saleId: sale.id, proposedRemarks: "", reason: "same", idempotencyKey: key() }, workerToken);
    expect(filed.success).toBe(false);
    if (!filed.success) expect(filed.message).toMatch(/same as the current remarks/i);
  });

  it("record drift beyond remarks (qty/amount) now CONFLICTS via the fingerprint", async () => {
    const sid = await makeSale("ctx remarks");
    const filed = await requestSaleRemarksEdit({ saleId: sid, proposedRemarks: "new", reason: "ctx", idempotencyKey: key() }, workerToken);
    expect(filed.success).toBe(true);
    if (!filed.success) return;
    await prisma.outgoingSale.update({ where: { id: sid }, data: { qty: 99, amount: 4950, finalAmount: 4950 } });
    const decided = await decideChangeRequest(filed.request.id, { approve: true }, principalToken);
    expect(decided.success).toBe(false);
    expect((decided as any).conflict).toBe(true);
    const sale = await prisma.outgoingSale.findUnique({ where: { id: sid } });
    expect(sale?.remarks).toBe("ctx remarks"); // nothing applied
    const req = await prisma.changeRequest.findUnique({ where: { id: filed.request.id } });
    expect(req?.status).toBe("CONFLICT");
  });

  it("a request filed without a fingerprint (pre-FULL57) fails CLOSED at approval, stays PENDING", async () => {
    const sid = await makeSale("legacy req");
    const row = await prisma.changeRequest.create({
      data: {
        idempotencyKey: key(),
        entityName: "OutgoingSale",
        entityId: sid,
        operation: "edit_remarks",
        originalValue: "legacy req",
        proposedValue: "should never apply",
        reason: "filed before fingerprinting",
        requestedById: workerId,
        requestedByName: `Worker-${RUN}`,
        // recordFingerprint intentionally absent (NULL)
      },
    });
    const decided = await decideChangeRequest(row.id, { approve: true }, principalToken);
    expect(decided.success).toBe(false);
    if (!decided.success) expect(decided.message).toMatch(/predates record-context tracking/i);
    const sale = await prisma.outgoingSale.findUnique({ where: { id: sid } });
    expect(sale?.remarks).toBe("legacy req"); // nothing applied
    const req = await prisma.changeRequest.findUnique({ where: { id: row.id } });
    expect(req?.status).toBe("PENDING"); // fail closed, not guessed approval
  });

  it("idempotency key reused with a different proposal is refused; another worker's key is refused without disclosure", async () => {
    const sidA = await makeSale("a");
    const sidB = await makeSale("b");
    const k = key();
    const first = await requestSaleRemarksEdit({ saleId: sidA, proposedRemarks: "x", reason: "r1", idempotencyKey: k }, workerToken);
    expect(first.success).toBe(true);
    // Same worker, different target/proposal/reason.
    const mismatched = await requestSaleRemarksEdit({ saleId: sidB, proposedRemarks: "DIFFERENT", reason: "r2", idempotencyKey: k }, workerToken);
    expect(mismatched.success).toBe(false);
    if (!mismatched.success) expect(mismatched.message).toMatch(/already used for a different request/i);
    // Different worker, same key: refused, no original contents returned.
    const crossWorker = await requestSaleRemarksEdit({ saleId: sidB, proposedRemarks: "probe", reason: "r3", idempotencyKey: k }, worker2Token);
    expect(crossWorker.success).toBe(false);
    if (!crossWorker.success) {
      expect(crossWorker.message).toMatch(/already used for a different request/i);
      expect(JSON.stringify(crossWorker)).not.toContain("r1"); // no leak of the original request
    }
    // Exact same retry parameters still return the original as a duplicate.
    const retry = await requestSaleRemarksEdit({ saleId: sidA, proposedRemarks: "x", reason: "r1", idempotencyKey: k }, workerToken);
    expect(retry.success).toBe(true);
    if (retry.success) expect(retry.duplicate).toBe(true);
  });

  it("concurrent approvals race: exactly one applies, one Sale audit, no double mutation", async () => {
    const sid = await makeSale("race");
    const filed = await requestSaleRemarksEdit({ saleId: sid, proposedRemarks: "won", reason: "race test", idempotencyKey: key() }, workerToken);
    expect(filed.success).toBe(true);
    if (!filed.success) return;
    const before = await prisma.auditLog.count({ where: { entityName: "Sale", entityId: sid } });
    const results = await Promise.all([
      decideChangeRequest(filed.request.id, { approve: true }, principalToken),
      decideChangeRequest(filed.request.id, { approve: true }, principalToken),
      decideChangeRequest(filed.request.id, { approve: true }, principalToken),
    ]);
    const applied = results.filter((r) => r.success && !(r as any).alreadyDecided);
    const replays = results.filter((r) => r.success && (r as any).alreadyDecided);
    expect(applied.length + replays.length).toBe(3); // every caller gets a truthful outcome
    expect(applied.length).toBe(1);
    const sale = await prisma.outgoingSale.findUnique({ where: { id: sid } });
    expect(sale?.remarks).toBe("won");
    expect(await prisma.auditLog.count({ where: { entityName: "Sale", entityId: sid } })).toBe(before + 1);
  });

  it("approver-visible trail carries the exact before/after diff", async () => {
    const sid = await makeSale("before text");
    const filed = await requestSaleRemarksEdit({ saleId: sid, proposedRemarks: "after text", reason: "diff check", idempotencyKey: key() }, workerToken);
    expect(filed.success).toBe(true);
    if (!filed.success) return;
    // The list view the approver reads carries original and proposed verbatim.
    const list = await listChangeRequests(principalToken);
    expect(list.success).toBe(true);
    const view = list.requests.find((r) => r.id === filed.request.id);
    expect(view?.originalValue).toBe("before text");
    expect(view?.proposedValue).toBe("after text");
    expect(view?.reason).toBe("diff check");
    const decided = await decideChangeRequest(filed.request.id, { approve: true }, principalToken);
    expect(decided.success).toBe(true);
    const saleAudit = await prisma.auditLog.findFirst({ where: { entityName: "Sale", entityId: sid }, orderBy: { createdAt: "desc" } });
    const payload = JSON.parse(String(saleAudit?.payload ?? "{}"));
    expect(payload.before).toEqual({ remarks: "before text" });
    expect(payload.after).toEqual({ remarks: "after text" });
  });
});

describe("FULL58 public error sanitation", () => {
  let saleId = "";
  let requestId = "";

  it("a raw internal failure surfaces a clear safe message: PENDING kept, zero writes, no ORM text", async () => {
    saleId = await makeSale("sanitation original");
    const filed = await requestSaleRemarksEdit({ saleId, proposedRemarks: "sanitation proposed", reason: "qa fault repro", idempotencyKey: key() }, workerToken);
    expect(filed.success).toBe(true);
    if (!filed.success) return;
    requestId = filed.request.id;
    const auditsBefore = await prisma.auditLog.count({ where: { entityName: "Sale", entityId: saleId } });
    (globalThis as any).__forceAuditPrismaText = true;
    const decided = await decideChangeRequest(requestId, { approve: true, note: "go" }, principalToken);
    expect(decided.success).toBe(false);
    if (!decided.success) {
      // The visible refusal must be intelligible and carry no internals.
      expect(decided.message).toBe("The decision could not be completed. Nothing was applied - the request is still pending. Please try again.");
      expect(decided.message).not.toMatch(/prisma|foreign key|invocation|constraint/i);
    }
    const req = await prisma.changeRequest.findUnique({ where: { id: requestId } });
    expect(req?.status).toBe("PENDING");
    const sale = await prisma.outgoingSale.findUnique({ where: { id: saleId } });
    expect(sale?.remarks).toBe("sanitation original");
    expect(await prisma.auditLog.count({ where: { entityName: "Sale", entityId: saleId } })).toBe(auditsBefore);
  });

  it("domain refusals keep their own intelligible messages (not genericized)", async () => {
    // Self-approval refusal must survive sanitation with its exact domain wording.
    const ownSale = await makeSale("own original");
    const filed = await requestSaleRemarksEdit({ saleId: ownSale, proposedRemarks: "own proposed", reason: "self approval check", idempotencyKey: key() }, principalToken);
    expect(filed.success).toBe(true);
    if (!filed.success) return;
    const decided = await decideChangeRequest(filed.request.id, { approve: true }, principalToken);
    expect(decided.success).toBe(false);
    if (!decided.success) expect(decided.message).toMatch(/your own request/i);
    await cancelChangeRequest(filed.request.id, principalToken);
  });

  it("the preserved PENDING request can still be decided after the fault clears", async () => {
    const decided = await decideChangeRequest(requestId, { approve: true, note: "retry after fault" }, principalToken);
    expect(decided.success).toBe(true);
    const sale = await prisma.outgoingSale.findUnique({ where: { id: saleId } });
    expect(sale?.remarks).toBe("sanitation proposed");
  });
});

describe("FULL60 edit/delete capture and bypass closure", () => {
  it("post-enrollment deleteSale with a valid legacy delete PIN is refused, zero writes", async () => {
    const { deleteSale } = await import("@/app/actions/sales");
    await updateGlobalSettings({ adminPin: settingsAdminPin, deletePin: "d3l3t3-f60" } as any);
    const sid = await makeSale("delete me not");
    const eventsBefore = await prisma.financialEvent.count();
    const result = await deleteSale(sid, "d3l3t3-f60", workerToken);
    expect(result.success).toBe(false);
    if (!result.success) expect((result as any).error ?? (result as any).message).toMatch(/approved change request/i);
    expect(await prisma.outgoingSale.findUnique({ where: { id: sid } })).toBeTruthy(); // sale intact
    expect(await prisma.financialEvent.count()).toBe(eventsBefore); // money history intact
  });

  it("captures an edit_fields request with an exact per-field diff; record unchanged", async () => {
    const { requestSaleFieldEdit } = await import("@/app/actions/change-requests");
    const sid = await makeSale("field edit original");
    const result = await requestSaleFieldEdit({ saleId: sid, changes: { qty: 12, remarks: "corrected note", ratePerCft: 50 }, reason: "wrong qty entered", idempotencyKey: key() }, workerToken);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.request.operation).toBe("edit_fields");
    const listed = await listChangeRequests(workerToken);
    const listedRow = (listed.requests ?? []).find((r: any) => r.id === result.request.id);
    expect(listedRow?.mine).toBe(true); // server-resolved ownership when listed as the filer
    // Only the differing fields are stored (ratePerCft 50 matches current).
    const original = JSON.parse(result.request.originalValue!);
    const proposed = JSON.parse(result.request.proposedValue!);
    expect(Object.keys(original)).toEqual(["qty", "remarks"]);
    expect(Number(original.qty)).toBe(10);
    expect(original.remarks).toBe("field edit original");
    expect(proposed).toEqual({ qty: 12, remarks: "corrected note" });
    const sale = await prisma.outgoingSale.findUnique({ where: { id: sid } });
    expect(Number(sale?.qty)).toBe(10);
    expect(sale?.remarks).toBe("field edit original");
  });

  it("captures a delete request with a full business-field snapshot; record intact", async () => {
    const { requestSaleDelete } = await import("@/app/actions/change-requests");
    const sid = await makeSale("delete snapshot");
    const result = await requestSaleDelete({ saleId: sid, reason: "duplicate entry", idempotencyKey: key() }, workerToken);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.request.operation).toBe("delete");
    expect(result.request.proposedValue).toBeNull();
    const snapshot = JSON.parse(result.request.originalValue!);
    expect(snapshot.remarks).toBe("delete snapshot");
    expect(Number(snapshot.qty)).toBe(10);
    expect(Number(snapshot.finalAmount)).toBe(500);
    expect(Object.keys(snapshot).length).toBeGreaterThan(20); // full snapshot, not a summary
    expect(await prisma.outgoingSale.findUnique({ where: { id: sid } })).toBeTruthy();
  });

  it("refuses non-whitelist fields and no-op patches at capture", async () => {
    const { requestSaleFieldEdit } = await import("@/app/actions/change-requests");
    const sid = await makeSale("whitelist check");
    const derived = await requestSaleFieldEdit({ saleId: sid, changes: { finalAmount: 1 }, reason: "r", idempotencyKey: key() }, workerToken);
    expect(derived.success).toBe(false);
    if (!derived.success) expect(derived.message).toMatch(/cannot be changed/);
    const noop = await requestSaleFieldEdit({ saleId: sid, changes: { qty: 10 }, reason: "r", idempotencyKey: key() }, workerToken);
    expect(noop.success).toBe(false);
    if (!noop.success) expect(noop.message).toMatch(/match the current record/);
    expect(await prisma.changeRequest.count({ where: { entityId: sid } })).toBe(0); // nothing filed
  });

  it("approving delete or an unsupported-field edit is refused truthfully: PENDING kept, zero writes", async () => {
    // FULL73: supported monetary fields (qty/rate/discount/gst) now APPLY;
    // see sale-edit-apply.test.ts. Delete requests and fields outside the
    // supported set remain truthfully refused.
    const { requestSaleFieldEdit, requestSaleDelete } = await import("@/app/actions/change-requests");
    const sid = await makeSale("gated apply");
    const editReq = await requestSaleFieldEdit({ saleId: sid, changes: { partyName: `Other-${RUN}` }, reason: "r", idempotencyKey: key() }, workerToken);
    const delReq = await requestSaleDelete({ saleId: sid, reason: "r", idempotencyKey: key() }, workerToken);
    expect(editReq.success && delReq.success).toBe(true);
    if (!editReq.success || !delReq.success) return;
    for (const reqId of [editReq.request.id, delReq.request.id]) {
      const auditsBefore = await prisma.auditLog.count();
      const decided = await decideChangeRequest(reqId, { approve: true, note: "go" }, principalToken);
      expect(decided.success).toBe(false);
      if (!decided.success) expect(decided.message).toMatch(/gated policy work|not implemented|not supported yet/i);
      const req = await prisma.changeRequest.findUnique({ where: { id: reqId } });
      expect(req?.status).toBe("PENDING");
      expect(await prisma.auditLog.count()).toBe(auditsBefore); // nothing applied, nothing audited
    }
    const sale = await prisma.outgoingSale.findUnique({ where: { id: sid } });
    expect(Number(sale?.qty)).toBe(10); // untouched
  });

  it("reject and cancel work for the new operations", async () => {
    const { requestSaleFieldEdit, requestSaleDelete } = await import("@/app/actions/change-requests");
    const sid = await makeSale("decide me");
    const editReq = await requestSaleFieldEdit({ saleId: sid, changes: { qty: 7 }, reason: "r", idempotencyKey: key() }, workerToken);
    const delReq = await requestSaleDelete({ saleId: sid, reason: "r", idempotencyKey: key() }, workerToken);
    expect(editReq.success && delReq.success).toBe(true);
    if (!editReq.success || !delReq.success) return;
    const rejected = await decideChangeRequest(editReq.request.id, { approve: false, note: "not valid" }, principalToken);
    expect(rejected.success).toBe(true);
    if (rejected.success) expect(rejected.request.status).toBe("REJECTED");
    const cancelled = await cancelChangeRequest(delReq.request.id, workerToken);
    expect(cancelled.success).toBe(true);
    if (cancelled.success) expect(cancelled.request.status).toBe("CANCELLED");
    expect(await prisma.outgoingSale.findUnique({ where: { id: sid } })).toBeTruthy();
  });

  it("idempotency binds the new operations; reuse with a different proposal refused without disclosure", async () => {
    const { requestSaleFieldEdit } = await import("@/app/actions/change-requests");
    const sid = await makeSale("idem check");
    const idem = key();
    const first = await requestSaleFieldEdit({ saleId: sid, changes: { qty: 3 }, reason: "r1", idempotencyKey: idem }, workerToken);
    const second = await requestSaleFieldEdit({ saleId: sid, changes: { qty: 3 }, reason: "r1", idempotencyKey: idem }, workerToken);
    expect(first.success && second.success).toBe(true);
    if (first.success && second.success) {
      expect(second.duplicate).toBe(true);
      expect(second.request.id).toBe(first.request.id);
    }
    const other = await requestSaleFieldEdit({ saleId: sid, changes: { qty: 4 }, reason: "r1", idempotencyKey: idem }, workerToken);
    expect(other.success).toBe(false);
    if (!other.success) expect(other.message).toMatch(/already used for a different request/);
    expect(await prisma.changeRequest.count({ where: { idempotencyKey: idem } })).toBe(1);
    if (first.success) await cancelChangeRequest(first.request.id, workerToken);
  });

  it("unenrolled legacy delete with a forced audit failure rolls everything back (fail-closed trail)", async () => {
    // Temporarily simulate the unenrolled production path: legacy PIN-gated
    // delete still exists there, and its audit write is now fail-closed.
    await prisma.appMeta.update({ where: { key: ENROLLMENT_KEY }, data: { value: "false" } });
    try {
      const { deleteSale } = await import("@/app/actions/sales");
      // FULL62 test correction: settings changes need the privileged principal
      // and the current admin PIN once settings exist; the previous bare call
      // failed silently, so the forced audit-failure path was never reached.
      const setRes = await updateGlobalSettings({ deletePin: "d3l-f60b" } as any, settingsAdminPin, principalToken);
      expect((setRes as any).success).toBe(true);
      const sid = await makeSale("unenrolled audit check");
      (globalThis as any).__forceAuditFail = true;
      const result = await deleteSale(sid, "d3l-f60b", undefined);
      expect(result.success).toBe(false);
      expect(await prisma.outgoingSale.findUnique({ where: { id: sid } })).toBeTruthy(); // nothing deleted
    } finally {
      (globalThis as any).__forceAuditFail = false;
      await prisma.appMeta.update({ where: { key: ENROLLMENT_KEY }, data: { value: "true" } });
    }
  });
});

describe("FULL62 capture corrections: purge gate and finite validation", () => {
  it("post-enrollment purgeNonGstSales with a valid legacy delete PIN is refused, zero writes", async () => {
    const { purgeNonGstSales } = await import("@/app/actions/sales");
    const { updateGlobalSettings } = await import("@/app/actions/settings");
    const setRes = await updateGlobalSettings({ deletePin: "d3l-f62" } as any, settingsAdminPin, principalToken);
    expect((setRes as any).success).toBe(true);
    const s1 = await makeSale("purge target 1");
    const s2 = await makeSale("purge target 2");
    const before = await prisma.outgoingSale.count();
    const result = await purgeNonGstSales("d3l-f62", workerToken);
    expect(result.success).toBe(false);
    // FULL74: bulk purge is retired outright - the refusal is permanent, not
    // just post-enrollment gating. Deliberate behavior change, disclosed.
    expect((result as any).error).toMatch(/retired/);
    expect(await prisma.outgoingSale.count()).toBe(before); // nothing purged
    expect(await prisma.outgoingSale.findUnique({ where: { id: s1 } })).toBeTruthy();
    expect(await prisma.outgoingSale.findUnique({ where: { id: s2 } })).toBeTruthy();
  });

  // FULL74: deliberate behavior change, disclosed - the previous test
  // ("unenrolled legacy purge with a valid PIN still runs") pinned the OLD
  // compatibility behavior. Bulk purge is now retired in EVERY state: no PIN,
  // no enrollment state, no session re-enables it. Nothing is ever deleted.
  it("unenrolled legacy purge with a valid PIN is now refused too (retired), zero deletion", async () => {
    const { purgeNonGstSales } = await import("@/app/actions/sales");
    const { updateGlobalSettings } = await import("@/app/actions/settings");
    const setRes = await updateGlobalSettings({ deletePin: "d3l-f62u" } as any, settingsAdminPin, principalToken);
    expect((setRes as any).success).toBe(true);
    await prisma.appMeta.update({ where: { key: ENROLLMENT_KEY }, data: { value: "false" } });
    try {
      const sid = await makeSale("unenrolled purge target");
      const result = await purgeNonGstSales("d3l-f62u", undefined);
      expect(result.success).toBe(false);
      expect((result as any).error).toMatch(/retired/);
      // Never deleted. (This fixture's makeSale writes the row directly, so
      // the survival assertion is on the record itself.)
      expect(await prisma.outgoingSale.findUnique({ where: { id: sid } })).toBeTruthy();
    } finally {
      await prisma.appMeta.update({ where: { key: ENROLLMENT_KEY }, data: { value: "true" } });
    }
  });

  it("the sales page UI no longer exposes any purge entry point", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/components/modules/sales-page.tsx", "utf8");
    expect(src).not.toContain("purgeNonGstSales");
    expect(src).not.toContain("raidPurge");
    expect(src).not.toContain("Purge Non-GST");
  });

  it("capture rejects non-finite numbers instead of silently storing null", async () => {
    const { requestSaleFieldEdit } = await import("@/app/actions/change-requests");
    const saleId = await makeSale("finite check");
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = await requestSaleFieldEdit(
        { saleId, changes: { qty: bad }, reason: "non-finite probe", idempotencyKey: crypto.randomUUID() },
        workerToken,
      );
      expect(result.success).toBe(false);
      expect((result as any).message).toMatch(/finite number/);
    }
    // Nothing filed for the bad proposals.
    const pending = await prisma.changeRequest.count({ where: { entityId: saleId, operation: "edit_fields" } });
    expect(pending).toBe(0);
    // A finite proposal still files normally (no over-rejection).
    const ok = await requestSaleFieldEdit(
      { saleId, changes: { qty: 12.5 }, reason: "legitimate correction", idempotencyKey: crypto.randomUUID() },
      workerToken,
    );
    expect(ok.success).toBe(true);
  });
});


// FULL73: approved monetary sale-edit apply. Direction: the user's delegated
// design judgment (10 Nov, user's own WhatsApp channel, message verified) - an approved edit corrects the ORIGINAL sale on its
// ORIGINAL day; old values, requester and approver stay visible; no payment
// or refund is invented. Reuses this file's enrolled principal/worker state.
describe("FULL73 approved monetary sale-edit apply", () => {
  const DAY = "2026-01-07";
  let matId = "";
  let matName = "";

  it("seeds its own material", async () => {
    matName = `M73-${RUN}`;
    const m = await prisma.material.create({ data: { materialName: matName, ratePerCft: 50 } });
    matId = m.id;
  });

  const newSale = async (tag: string, paid: number, remarks: string) => {
    const created = await saveSale({
      saleDate: DAY, vehicleNumber: `KL7${tag}-${RUN}`, partyName: `P7${tag}-${RUN}`, materialId: matId,
      qty: 10, ratePerCft: 50, discountType: "fixed", discountValue: 0,
      cashPaid: paid, bankPaid: 0, gPayPaid: 0, bookNumber: tag, pageNumber: "1", remarks,
    }, undefined, workerToken);
    expect(created.success).toBe(true);
    return (created as any).data.id as string;
  };

  let saleId = "";
  it("an approved qty+rate correction rewrites the original day consistently, paid amounts untouched", async () => {
    saleId = await newSale("1", 200, "orig");
    const filed = await requestSaleFieldEdit({ saleId, changes: { qty: 5, ratePerCft: 40 }, reason: "weighed less than booked", idempotencyKey: key() }, workerToken);
    expect(filed.success).toBe(true);
    if (!filed.success) return;
    const decided = await decideChangeRequest(filed.request.id, { approve: true, note: "ok" }, principalToken);
    expect(decided.success).toBe(true);
    if (decided.success) expect(decided.request.status).toBe("APPLIED");

    const sale = await prisma.outgoingSale.findUnique({ where: { id: saleId } });
    expect({ qty: sale?.qty, rate: sale?.ratePerCft, amount: sale?.amount, final: sale?.finalAmount }).toEqual({ qty: 5, rate: 40, amount: 200, final: 200 });
    // Money that moved is untouched: paid splits and paidTotal stay 200.
    expect({ cash: sale?.cashPaid, bank: sale?.bankPaid, gpay: sale?.gPayPaid, paidTotal: sale?.paidTotal }).toEqual({ cash: 200, bank: 0, gpay: 0, paidTotal: 200 });
    expect(sale?.remainingCredit).toBe(0); // 200 corrected total - 200 paid
    expect(sale?.saleDate.getTime()).toBe(new Date(2026, 0, 7).getTime()); // original day kept (canonical local-midnight)

    // Immutable event history: original event intact, correction appended.
    const events = await prisma.financialEvent.findMany({ where: { entityId: saleId }, orderBy: { createdAt: "asc" } });
    expect(events.length).toBe(2);
    expect((events[0].payload as any).finalAmount).toBe(500);
    expect((events[1].payload as any).finalAmount).toBe(200);

    // Projection: exactly one ledger row for the sale, corrected values.
    const entries = await prisma.ledgerEntry.findMany({ where: { entityId: saleId } });
    expect(entries.length).toBe(1);
    expect({ total: entries[0].totalAmount, credit: entries[0].creditAmount, cash: entries[0].cashAmount }).toEqual({ total: 200, credit: 0, cash: 200 });

    // Stored Day Book for the ORIGINAL day agrees (paid cash unchanged).
    const book = await prisma.dayBook.findFirst({ where: { businessDate: new Date(DAY + "T00:00:00.000Z") } }); // Day Book keys are UTC-midnight businessDateKey
    expect(book?.cashSalesTotal).toBe(200);

    // Inventory restored by the qty delta (10 -> 5).
    const stock = await prisma.inventoryStock.findUnique({ where: { materialName: matName.toUpperCase() } });
    expect(stock?.quantity).toBe(-5);

    // Party ledger: corrected credit 0 -> no outstanding SALE debit.
    const party = await prisma.party.findFirst({ where: { partyName: `P71-${RUN}` } });
    const ledgerRows = await prisma.partyLedger.findMany({ where: { partyId: party!.id } });
    expect(ledgerRows.filter((r) => r.type === "SALE").length).toBe(0);

    // Audit trail: who approved, what changed, why.
    const audit = await prisma.auditLog.findFirst({ where: { entityName: "Sale", entityId: saleId, action: "update" }, orderBy: { createdAt: "desc" } });
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit)).toContain("weighed less than booked");
  });

  it("a correction below what the customer already paid is refused truthfully; nothing changes", async () => {
    const sid = await newSale("2", 500, "paid in full");
    const filed = await requestSaleFieldEdit({ saleId: sid, changes: { qty: 5 }, reason: "weighed less", idempotencyKey: key() }, workerToken);
    expect(filed.success).toBe(true);
    if (!filed.success) return;
    const decided = await decideChangeRequest(filed.request.id, { approve: true }, principalToken);
    expect(decided.success).toBe(false);
    if (!decided.success) expect(decided.message).toMatch(/Payment cannot exceed final amount/i);
    const req = await prisma.changeRequest.findUnique({ where: { id: filed.request.id } });
    expect(req?.status).toBe("PENDING"); // cancelable, re-fileable
    const sale = await prisma.outgoingSale.findUnique({ where: { id: sid } });
    expect({ qty: sale?.qty, final: sale?.finalAmount }).toEqual({ qty: 10, final: 500 });
    expect(await prisma.financialEvent.count({ where: { entityId: sid } })).toBe(1);
    const entries = await prisma.ledgerEntry.findMany({ where: { entityId: sid } });
    expect(entries.length).toBe(1);
    expect(entries[0].totalAmount).toBe(500);
  });

  it("later collections survive a correction: party ledger shows corrected debt minus the collection", async () => {
    const sid = await newSale("3", 0, "on credit");
    const party = await prisma.party.findFirst({ where: { partyName: `P73-${RUN}` } });
    await prisma.partyCollection.create({
      data: { partyId: party!.id, partyName: `P73-${RUN}`, collectionDate: new Date(2026, 0, 8), totalAmount: 300, cashPaid: 300, bankPaid: 0, gPayPaid: 0, sourceEventId: `coll-${RUN}` },
    });
    const filed = await requestSaleFieldEdit({ saleId: sid, changes: { ratePerCft: 40 }, reason: "rate agreed lower", idempotencyKey: key() }, workerToken);
    expect(filed.success).toBe(true);
    if (!filed.success) return;
    const decided = await decideChangeRequest(filed.request.id, { approve: true }, principalToken);
    expect(decided.success).toBe(true);
    const sale = await prisma.outgoingSale.findUnique({ where: { id: sid } });
    expect({ final: sale?.finalAmount, credit: sale?.remainingCredit }).toEqual({ final: 400, credit: 400 });
    const rows = await prisma.partyLedger.findMany({ where: { partyId: party!.id } });
    const saleRow = rows.find((r) => r.type === "SALE");
    const collRow = rows.find((r) => r.type === "PAYMENT_RECEIVED");
    expect(saleRow?.debitAmount).toBe(400); // corrected debt, not the original 500
    expect(collRow?.creditAmount).toBe(300); // the real later collection is preserved
  });

  it("replay/rebuild parity: rebuilding the ledger from events reproduces the corrected projection", async () => {
    const { rebuildLedger } = await import("@/lib/domain/ledger/service");
    const before = await prisma.ledgerEntry.findMany({ where: { entityId: saleId } });
    expect(before.length).toBe(1);
    await rebuildLedger(prisma as any);
    const after = await prisma.ledgerEntry.findMany({ where: { entityId: saleId } });
    expect(after.length).toBe(1);
    expect({ total: after[0].totalAmount, cash: after[0].cashAmount }).toEqual({ total: 200, cash: 200 });
    expect(await prisma.financialEvent.count({ where: { entityId: saleId } })).toBe(2); // events untouched
  });

  it("an audit fault during apply rolls EVERYTHING back: row, events, ledger, request pending", async () => {
    const sid = await newSale("4", 0, "credit sale");
    const filed = await requestSaleFieldEdit({ saleId: sid, changes: { qty: 5 }, reason: "weighed less", idempotencyKey: key() }, workerToken);
    expect(filed.success).toBe(true);
    if (!filed.success) return;
    (globalThis as any).__forceAuditFail = true;
    const decided = await decideChangeRequest(filed.request.id, { approve: true }, principalToken);
    (globalThis as any).__forceAuditFail = false;
    expect(decided.success).toBe(false);
    // The failure must come from the injected audit fault inside apply, not
    // from the dispatch refusing the operation: this is what makes the
    // rollback test fail-first on trees without FULL73.
    if (!decided.success) expect(decided.message).not.toMatch(/not implemented|not supported yet|gated policy work/i);
    const sale = await prisma.outgoingSale.findUnique({ where: { id: sid } });
    expect({ qty: sale?.qty, final: sale?.finalAmount }).toEqual({ qty: 10, final: 500 });
    expect(await prisma.financialEvent.count({ where: { entityId: sid } })).toBe(1);
    expect((await prisma.ledgerEntry.findMany({ where: { entityId: sid } })).length).toBe(1);
    expect((await prisma.changeRequest.findUnique({ where: { id: filed.request.id } }))?.status).toBe("PENDING");
  });

  // FULL73R repairs from independent QA's two material findings.
  it("replay determinism: an injected createdAt tie can never restore the old projection", async () => {
    const sid = await newSale("5", 0, "tie probe");
    const filed = await requestSaleFieldEdit({ saleId: sid, changes: { qty: 8 }, reason: "tie probe", idempotencyKey: key() }, workerToken);
    expect(filed.success).toBe(true);
    if (!filed.success) return;
    expect((await decideChangeRequest(filed.request.id, { approve: true }, principalToken)).success).toBe(true);
    const events = await prisma.financialEvent.findMany({ where: { entityId: sid }, orderBy: { createdAt: "asc" } });
    expect(events.length).toBe(2);
    // The correction names the revision it supersedes.
    expect((events[1].payload as any).supersedesEventId).toBe(events[0].eventId);
    // Inject QA's tie: identical createdAt on both revisions. UUID order must
    // be irrelevant now.
    const when = new Date("2026-01-10T10:00:00.000Z");
    await prisma.financialEvent.update({ where: { eventId: events[0].eventId }, data: { createdAt: when } });
    await prisma.financialEvent.update({ where: { eventId: events[1].eventId }, data: { createdAt: when } });
    const { rebuildLedger } = await import("@/lib/domain/ledger/service");
    await rebuildLedger(prisma as any);
    const entries = await prisma.ledgerEntry.findMany({ where: { entityId: sid } });
    expect(entries.length).toBe(1);
    expect(entries[0].totalAmount).toBe(400); // the correction ALWAYS wins
    expect(entries[0].financialEventId).toBe(events[1].eventId);
  });

  it("a correction that would create customer credit (later collections exceed the corrected debt) is refused truthfully", async () => {
    const sid = await newSale("6", 0, "credit sale"); // 500 on credit
    const party = await prisma.party.findFirst({ where: { partyName: `P76-${RUN}` } });
    await prisma.partyCollection.create({
      data: { partyId: party!.id, partyName: `P76-${RUN}`, collectionDate: new Date(2026, 0, 8), totalAmount: 300, cashPaid: 300, bankPaid: 0, gPayPaid: 0, sourceEventId: `coll6-${RUN}` },
    });
    const { recalculatePartyLedger } = await import("@/lib/domain/ledger/party-ledger-service");
    await recalculatePartyLedger(prisma as any, party!.id); // mirrors the real collection path
    const filed = await requestSaleFieldEdit({ saleId: sid, changes: { qty: 4 }, reason: "weighed much less", idempotencyKey: key() }, workerToken);
    expect(filed.success).toBe(true);
    if (!filed.success) return;
    const decided = await decideChangeRequest(filed.request.id, { approve: true }, principalToken);
    expect(decided.success).toBe(false);
    if (!decided.success) expect(decided.message).toMatch(/paid more than they owe|customer credit/i);
    // Nothing changed: record, request, events, projection, party balance.
    const sale = await prisma.outgoingSale.findUnique({ where: { id: sid } });
    expect({ qty: sale?.qty, final: sale?.finalAmount }).toEqual({ qty: 10, final: 500 });
    expect((await prisma.changeRequest.findUnique({ where: { id: filed.request.id } }))?.status).toBe("PENDING");
    expect(await prisma.financialEvent.count({ where: { entityId: sid } })).toBe(1);
    const rows = await prisma.partyLedger.findMany({ where: { partyId: party!.id }, orderBy: { date: "asc" } });
    expect(rows.at(-1)?.balance).toBe(200); // 500 debt - 300 real collection, unchanged
  });

  it("a correction that only reduces a pre-existing customer-credit balance is NOT blocked", async () => {
    const sid = await newSale("7", 0, "credit sale"); // 500 on credit
    const party = await prisma.party.findFirst({ where: { partyName: `P77-${RUN}` } });
    await prisma.partyCollection.create({
      data: { partyId: party!.id, partyName: `P77-${RUN}`, collectionDate: new Date(2026, 0, 8), totalAmount: 700, cashPaid: 700, bankPaid: 0, gPayPaid: 0, sourceEventId: `coll7-${RUN}` },
    });
    const { recalculatePartyLedger } = await import("@/lib/domain/ledger/party-ledger-service");
    await recalculatePartyLedger(prisma as any, party!.id); // balance now -200 (pre-existing customer credit)
    // Raising the corrected total toward the collected amount improves the
    // balance (-200 -> -100): the guard must not block improvements.
    const filed = await requestSaleFieldEdit({ saleId: sid, changes: { qty: 12 }, reason: "quantity was under-recorded", idempotencyKey: key() }, workerToken);
    expect(filed.success).toBe(true);
    if (!filed.success) return;
    const decided = await decideChangeRequest(filed.request.id, { approve: true }, principalToken);
    expect(decided.success).toBe(true);
    const sale = await prisma.outgoingSale.findUnique({ where: { id: sid } });
    expect(sale?.finalAmount).toBe(600);
    const rows = await prisma.partyLedger.findMany({ where: { partyId: party!.id }, orderBy: { date: "asc" } });
    expect(rows.at(-1)?.balance).toBe(-100); // improved, still pre-existing credit, no refund invented
  });

  // FULL73R2 repairs from independent QA's chain-fork finding.
  it("successive corrections chain by revision, not by clock: a future-dated original cannot steal the head", async () => {
    const sid = await newSale("8", 0, "chain head");
    const first = await requestSaleFieldEdit({ saleId: sid, changes: { qty: 8 }, reason: "first correction", idempotencyKey: key() }, workerToken);
    expect(first.success).toBe(true);
    if (!first.success) return;
    expect((await decideChangeRequest(first.request.id, { approve: true }, principalToken)).success).toBe(true);
    const [original, correction1] = await prisma.financialEvent.findMany({ where: { entityId: sid }, orderBy: { createdAt: "asc" } });
    expect((correction1.payload as any).supersedesEventId).toBe(original.eventId);
    // QA's controlled-clock condition: the ORIGINAL event carries a future
    // timestamp. A clock-ordered "latest" pick would choose it again and fork
    // the chain; the head must be chosen by the supersession marker instead.
    await prisma.financialEvent.update({ where: { eventId: original.eventId }, data: { createdAt: new Date("2030-01-01") } });
    const second = await requestSaleFieldEdit({ saleId: sid, changes: { qty: 6 }, reason: "second correction", idempotencyKey: key() }, workerToken);
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect((await decideChangeRequest(second.request.id, { approve: true }, principalToken)).success).toBe(true);
    const events = await prisma.financialEvent.findMany({ where: { entityId: sid } });
    expect(events.length).toBe(3);
    const correction2 = events.find((e) => e.eventId !== original.eventId && e.eventId !== correction1.eventId)!;
    // The second correction supersedes the CURRENT revision (correction1),
    // never the clock-newest event.
    expect((correction2.payload as any).supersedesEventId).toBe(correction1.eventId);
    const sale = await prisma.outgoingSale.findUniqueOrThrow({ where: { id: sid } });
    expect(sale.finalAmount).toBe(300);
    // Projection order can never resurrect a superseded revision: replay the
    // correction events in reverse and the ledger still shows the head.
    const { projectLedgerFromFinancialEvent, rebuildLedger } = await import("@/lib/domain/ledger/service");
    await prisma.ledgerEntry.deleteMany({ where: { entityId: sid } });
    await projectLedgerFromFinancialEvent(prisma as any, correction2);
    await projectLedgerFromFinancialEvent(prisma as any, correction1);
    expect((await prisma.ledgerEntry.findFirstOrThrow({ where: { entityId: sid } })).totalAmount).toBe(300);
    await rebuildLedger(prisma as any);
    expect((await prisma.ledgerEntry.findFirstOrThrow({ where: { entityId: sid } })).totalAmount).toBe(300);
  });

  it("a sale with an ambiguous correction history (a stored fork) is refused truthfully, nothing written", async () => {
    const sid = await newSale("9", 0, "fork probe");
    const original = await prisma.financialEvent.findFirstOrThrow({ where: { entityId: sid } });
    // Hand-craft a fork: two unsuperseded events both claiming to supersede
    // the original. No honest "current revision" exists, so applying another
    // correction must refuse instead of guessing.
    for (const amt of [400, 300]) {
      await prisma.financialEvent.create({
        data: { correlationId: sid, eventType: "SALE_CREATED", entityType: "Sale", entityId: sid, payload: { supersedesEventId: original.eventId, saleId: sid, finalAmount: amt } },
      });
    }
    const filed = await requestSaleFieldEdit({ saleId: sid, changes: { qty: 8 }, reason: "should be refused", idempotencyKey: key() }, workerToken);
    expect(filed.success).toBe(true);
    if (!filed.success) return;
    const decided = await decideChangeRequest(filed.request.id, { approve: true }, principalToken);
    expect(decided.success).toBe(false);
    if (!decided.success) expect(decided.message).toMatch(/ambiguous|history/i);
    // Nothing changed: record, request, events, projection.
    const sale = await prisma.outgoingSale.findUniqueOrThrow({ where: { id: sid } });
    expect({ qty: sale.qty, final: sale.finalAmount }).toEqual({ qty: 10, final: 500 });
    expect((await prisma.changeRequest.findUnique({ where: { id: filed.request.id } }))?.status).toBe("PENDING");
    expect(await prisma.financialEvent.count({ where: { entityId: sid } })).toBe(3);
    expect((await prisma.ledgerEntry.findFirstOrThrow({ where: { entityId: sid } })).totalAmount).toBe(500);
  });
});
