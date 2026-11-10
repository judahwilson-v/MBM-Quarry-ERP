"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestSaleRemarksEdit } from "@/app/actions/change-requests";
import { getSessionToken } from "@/lib/session-client";

// Files a remarks change REQUEST for one sale. The sale itself is never
// mutated here; the enrolled approver decides from the requests panel.
// States exercised: pending submit, double-click guard, idempotent retry
// (same key across retries), refusal with typed text retained, expired
// session message.
export function SaleRemarksRequestDialog({
  saleId,
  currentRemarks,
  onClose,
  onSubmitted,
}: {
  saleId: string;
  currentRemarks: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [proposed, setProposed] = useState(currentRemarks);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  // One idempotency key per dialog open: a retry after a failed or uncertain
  // submit reuses it, so the server returns the original request instead of
  // filing a duplicate.
  const idemKey = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    setProposed(currentRemarks);
    setReason("");
    setError("");
    setDone(null);
    idemKey.current = crypto.randomUUID();
  }, [saleId, currentRemarks]);

  async function submit() {
    if (submitting) return; // double-click guard
    setSubmitting(true);
    setError("");
    try {
      const result = await requestSaleRemarksEdit(
        { saleId, proposedRemarks: proposed, reason, idempotencyKey: idemKey.current },
        getSessionToken(),
      );
      if (result.success) {
        setDone(result.duplicate ? "This request was already filed (retry safely returned the original)." : "Request filed. The record stays unchanged until the approver decides.");
        onSubmitted();
      } else {
        // Refusal (including an expired session): typed text stays in place.
        setError(result.message || "Request refused.");
      }
    } catch (e: any) {
      setError(e?.message || "Request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request remarks change</DialogTitle>
          <DialogDescription>
            The sale is NOT changed now. Your request, the current remarks, and your proposed remarks go to the approver with your name and reason.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Current remarks</div>
            <div className="text-sm border rounded-md p-2 bg-muted/40 min-h-8">{currentRemarks || <span className="text-muted-foreground">(empty)</span>}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Proposed remarks</div>
            <Input value={proposed} onChange={(e) => setProposed(e.target.value)} disabled={submitting || !!done} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Reason (required)</div>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why should this change?" disabled={submitting || !!done} />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          {done && <div className="text-sm text-green-700">{done}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>{done ? "Close" : "Cancel"}</Button>
          {!done && (
            <Button onClick={submit} disabled={submitting || !reason.trim()}>
              {submitting ? "Filing..." : "File request"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
