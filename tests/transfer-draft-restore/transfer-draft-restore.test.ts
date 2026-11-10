// FULL70: a restored past-date transfer draft must preserve its original date
// visibly, and the discard wording must distinguish an unknown-outcome attempt
// from a never-sent draft.
import { describe, expect, it } from "vitest";
import {
  parseTransferDraft,
  restoreTransferDraft,
  transferDraftNotice,
  TRANSFER_DRAFT_KEY,
  type TransferDraft,
} from "@/lib/transfer-draft";

const pastDateDraft: TransferDraft = {
  submissionId: "11111111-2222-4333-8444-555555555555",
  type: "CASH_TO_BANK",
  amount: 150,
  time: "09:15 AM",
  date: "2026-11-09",
  remarks: "evening deposit",
  userName: "judah",
  attempted: true,
};

describe("parseTransferDraft", () => {
  it("returns null for missing or corrupt storage", () => {
    expect(parseTransferDraft(null)).toBeNull();
    expect(parseTransferDraft("not json")).toBeNull();
    expect(parseTransferDraft("{}")).toBeNull();
    expect(parseTransferDraft(JSON.stringify({ submissionId: 42 }))).toBeNull();
  });

  it("parses a well-formed draft", () => {
    const draft = parseTransferDraft(JSON.stringify(pastDateDraft));
    expect(draft?.submissionId).toBe(pastDateDraft.submissionId);
    expect(draft?.date).toBe("2026-11-09");
  });
});

describe("restoreTransferDraft", () => {
  it("preserves the original attempt date instead of filling today", () => {
    const restored = restoreTransferDraft(pastDateDraft);
    expect(restored.date).toBe("2026-11-09");
    expect(restored.type).toBe("CASH_TO_BANK");
    expect(restored.amount).toBe("150");
    expect(restored.remarks).toBe("evening deposit");
  });

  it("tolerates a missing remarks field", () => {
    const restored = restoreTransferDraft({ ...pastDateDraft, remarks: undefined as unknown as string });
    expect(restored.remarks).toBe("");
  });
});

describe("transferDraftNotice", () => {
  it("treats a sent attempt as unknown outcome, never 'unsent'", () => {
    const notice = transferDraftNotice(pastDateDraft);
    expect(notice.message).toContain("2026-11-09");
    expect(notice.message).toContain("may already be recorded");
    expect(notice.message).not.toContain("never sent");
    expect(notice.discardLabel).toBe("Discard reminder");
    expect(notice.message).toContain("never deletes a saved record");
  });

  it("treats a legacy draft without the attempted flag as unknown outcome", () => {
    const legacy = { ...pastDateDraft };
    delete legacy.attempted;
    const notice = transferDraftNotice(legacy);
    expect(notice.discardLabel).toBe("Discard reminder");
  });

  it("calls only a never-sent draft unsent", () => {
    const notice = transferDraftNotice({ ...pastDateDraft, attempted: false });
    expect(notice.message).toContain("never sent");
    expect(notice.discardLabel).toBe("Discard unsent draft");
  });
});

describe("draft storage key", () => {
  it("stays stable so in-flight drafts survive the upgrade", () => {
    expect(TRANSFER_DRAFT_KEY).toBe("mbm_transfer_draft");
  });
});
