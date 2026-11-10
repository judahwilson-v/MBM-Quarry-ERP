"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestSaleDelete } from "@/app/actions/change-requests";
import { getSessionToken } from "@/lib/session-client";

// FULL62: files a delete change REQUEST for one sale (capture only). The sale
// is never deleted here; the enrolled approver decides from the requests
// panel, and approval of deletes stays gated until the owner's delete
// accounting policy (void vs removal) is decided. The dialog never implies
// the deletion happened.
export function SaleDeleteRequestDialog({
  sale,
  onClose,
  onSubmitted,
}: {
  sale: Record<string, any>;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  // One idempotency key per dialog open: a retry after a failed or uncertain
  // submit reuses it, so the server returns the original request instead of
  // filing a duplicate.
  const idemKey = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    setReason("");
    setError("");
    setDone(null);
    idemKey.current = crypto.randomUUID();
  }, [sale?.id]);

  async function submit() {
    if (submitting) return; // double-click guard
    setSubmitting(true);
    setError("");
    try {
      const result = await requestSaleDelete(
        { saleId: sale.id, reason, idempotencyKey: idemKey.current },
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
          <DialogTitle>Request sale deletion</DialogTitle>
          <DialogDescription>
            The sale is NOT deleted now. A full snapshot of the record, your name and your reason go to the approver. Approval of deletions is not available yet; the request is recorded for review.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm border rounded-md p-2 bg-muted/40">
            {sale?.saleDate ? new Date(sale.saleDate).toLocaleDateString("en-IN") : ""} · {sale?.vehicleNumber ?? ""} · {sale?.partyName ?? ""} · {sale?.materialName ?? ""} · qty {sale?.qty ?? ""} · ₹{sale?.finalAmount ?? ""}
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Reason (required)</div>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why should this sale be deleted?" disabled={submitting || !!done} />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          {done && <div className="text-sm text-green-700">{done}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>{done ? "Close" : "Cancel"}</Button>
          {!done && (
            <Button onClick={submit} disabled={submitting || !reason.trim()}>
              {submitting ? "Filing..." : "File delete request"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
