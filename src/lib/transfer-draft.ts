// FULL70: transfer draft restore + notice wording, extracted from the Day Book
// page so retry-date preservation and discard wording are directly testable.

export interface TransferDraft {
  submissionId: string;
  type: string;
  amount: number;
  time: string;
  date: string;
  remarks: string;
  userName: string;
  attempted?: boolean;
}

export const TRANSFER_DRAFT_KEY = "mbm_transfer_draft";

export function parseTransferDraft(raw: string | null): TransferDraft | null {
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw);
    if (
      draft &&
      typeof draft.submissionId === "string" &&
      typeof draft.date === "string" &&
      draft.date.length > 0
    ) {
      return draft as TransferDraft;
    }
    return null;
  } catch {
    return null;
  }
}

// Restoring a pending draft must put the ORIGINAL attempt back in front of the
// user: same type, amount, remarks, and the SAME calendar date. Silently
// filling today's date would make an unchanged-looking retry carry changed
// intent, which the server rightly refuses.
export function restoreTransferDraft(draft: TransferDraft): {
  type: string;
  amount: string;
  remarks: string;
  date: string;
} {
  return {
    type: draft.type,
    amount: String(draft.amount),
    remarks: draft.remarks ?? "",
    date: draft.date,
  };
}

export interface TransferDraftNotice {
  message: string;
  discardLabel: string;
}

// A persisted draft whose attempt was already sent has an UNKNOWN outcome: it
// may already be recorded. Only a draft that was never sent may be called
// unsent. The wording must never claim "unsent" when the outcome is unknown,
// and discarding must never imply it deletes a saved record.
export function transferDraftNotice(draft: TransferDraft): TransferDraftNotice {
  if (draft.attempted === false) {
    return {
      message: `A transfer draft for ${draft.date} was never sent. Resubmitting sends it as a new attempt.`,
      discardLabel: "Discard unsent draft",
    };
  }
  return {
    message: `A transfer attempt for ${draft.date} is still unconfirmed. It may already be recorded for that day. Resubmitting retries the same reference, so it cannot duplicate. Check that day's transfers before changing the details. Discarding clears only this reminder; it never deletes a saved record.`,
    discardLabel: "Discard reminder",
  };
}
