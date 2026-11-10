"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestSaleFieldEdit } from "@/app/actions/change-requests";
import { OUTGOING_SALE_EDITABLE_FIELDS } from "@/lib/domain/change-requests/fingerprint";
import { BOOLEAN_FIELDS, DATE_FIELDS, DEFAULT_EDIT_FIELD, FIELD_LABELS, NUMBER_FIELDS, parseProposedValue } from "@/lib/domain/sale-edit-proposal";
import { getSessionToken } from "@/lib/session-client";

// FULL62: files an edit change REQUEST for one sale (capture only). The sale
// itself is never mutated here; the enrolled approver decides from the
// requests panel, and approval of field edits stays gated until the owner's
// accounting policy is decided. The dialog never implies the change happened.
// States exercised: pending submit, double-click guard, idempotent retry
// (same key across retries), refusal with typed text retained.

type Staged = { field: string; value: unknown };

function formatCurrent(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(empty)";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

export function SaleEditRequestDialog({
  sale,
  initialField,
  onClose,
  onSubmitted,
}: {
  sale: Record<string, any>;
  initialField?: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [staged, setStaged] = useState<Staged[]>([]);
  const [field, setField] = useState<string>(initialField ?? DEFAULT_EDIT_FIELD);
  const [rawValue, setRawValue] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  // One idempotency key per dialog open: a retry after a failed or uncertain
  // submit reuses it, so the server returns the original request instead of
  // filing a duplicate.
  const idemKey = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    setStaged([]);
    setField(initialField ?? DEFAULT_EDIT_FIELD);
    setRawValue("");
    setReason("");
    setError("");
    setDone(null);
    idemKey.current = crypto.randomUUID();
  }, [sale?.id, initialField]);

  function stageField() {
    setError("");
    try {
      const value = parseProposedValue(field, rawValue);
      setStaged((cur) => [...cur.filter((c) => c.field !== field), { field, value }]);
      setRawValue("");
    } catch (e: any) {
      setError(e?.message || "Invalid value.");
    }
  }

  async function submit() {
    if (submitting) return; // double-click guard
    setSubmitting(true);
    setError("");
    try {
      const changes: Record<string, unknown> = {};
      for (const c of staged) changes[c.field] = c.value;
      const result = await requestSaleFieldEdit(
        { saleId: sale.id, changes, reason, idempotencyKey: idemKey.current },
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
          <DialogTitle>Request sale edit</DialogTitle>
          <DialogDescription>
            The sale is NOT changed now. Your proposed changes, the current values, your name and your reason go to the approver. Approval of field edits is not available yet; the request is recorded for review.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">Field</div>
              <select
                className="w-full border rounded-md p-2 text-sm bg-background"
                value={field}
                onChange={(e) => setField(e.target.value)}
                disabled={submitting || !!done}
              >
                {OUTGOING_SALE_EDITABLE_FIELDS.map((f) => (
                  <option key={f} value={f}>{FIELD_LABELS[f] ?? f}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">Current: {formatCurrent(sale?.[field])}</div>
              {BOOLEAN_FIELDS.has(field) ? (
                <select
                  className="w-full border rounded-md p-2 text-sm bg-background"
                  value={rawValue}
                  onChange={(e) => setRawValue(e.target.value)}
                  disabled={submitting || !!done}
                >
                  <option value="">Choose...</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <Input
                  type={NUMBER_FIELDS.has(field) ? "number" : DATE_FIELDS.has(field) ? "date" : "text"}
                  value={rawValue}
                  onChange={(e) => setRawValue(e.target.value)}
                  placeholder="Proposed value"
                  disabled={submitting || !!done}
                />
              )}
            </div>
            <Button variant="outline" onClick={stageField} disabled={submitting || !!done}>Add</Button>
          </div>
          {staged.length > 0 && (
            <div className="border rounded-md p-2 text-sm space-y-1">
              {staged.map((c) => (
                <div key={c.field} className="flex justify-between gap-2">
                  <span>{FIELD_LABELS[c.field] ?? c.field}: {formatCurrent(sale?.[c.field])} → {c.value === null ? "(empty)" : String(c.value)}</span>
                  <button type="button" className="text-xs text-muted-foreground" onClick={() => setStaged((cur) => cur.filter((x) => x.field !== c.field))} disabled={submitting || !!done}>remove</button>
                </div>
              ))}
            </div>
          )}
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
            <Button onClick={submit} disabled={submitting || !reason.trim() || staged.length === 0}>
              {submitting ? "Filing..." : "File request"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
