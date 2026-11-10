"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listChangeRequests, decideChangeRequest, cancelChangeRequest, type ChangeRequestView } from "@/app/actions/change-requests";
import { amIControlPrincipal } from "@/app/actions/auth";
import { getSessionToken } from "@/lib/session-client";

// Change request trail for this device. Every state is shown: PENDING,
// APPLIED, REJECTED, CANCELLED, CONFLICT. The enrolled principal gets
// approve/reject; the requester can cancel their own pending request.
// Decisions are server-atomic; a stale record surfaces as CONFLICT with
// nothing applied. All data stays on this device (local-only prototype).
const OPERATION_LABELS: Record<string, string> = {
  edit_remarks: "Remarks change",
  edit_fields: "Sale edit",
  delete: "Sale deletion",
};

function fmtDiffValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(empty)";
  return String(v);
}

// FULL60: operation-aware request body. edit_remarks keeps the simple
// Current/Proposed pair; edit_fields shows an exact per-field before/after
// diff; delete shows the full business-field snapshot of what would be
// deleted. Unparseable payloads surface as an honest error, never silence.
function RequestValues({ r }: { r: ChangeRequestView }) {
  if (r.operation === "edit_remarks") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <div><span className="text-xs text-muted-foreground">Current: </span>{r.originalValue || <em>(empty)</em>}</div>
        <div><span className="text-xs text-muted-foreground">Proposed: </span>{r.proposedValue || <em>(empty)</em>}</div>
      </div>
    );
  }
  let original: Record<string, unknown> = {};
  let proposed: Record<string, unknown> = {};
  let parseFailed = false;
  try { original = r.originalValue ? JSON.parse(r.originalValue) : {}; } catch { parseFailed = true; }
  try { proposed = r.proposedValue ? JSON.parse(r.proposedValue) : {}; } catch { parseFailed = true; }
  if (parseFailed) return <div className="text-xs text-red-600">This request&apos;s details could not be displayed.</div>;
  if (r.operation === "edit_fields") {
    return (
      <div className="space-y-0.5">
        {Object.keys(original).map((f) => (
          <div key={f}><span className="text-xs text-muted-foreground">{f}: </span>{fmtDiffValue(original[f])} → {fmtDiffValue(proposed[f])}</div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-0.5 max-h-48 overflow-y-auto">
      {Object.entries(original).map(([f, v]) => (
        <div key={f}><span className="text-xs text-muted-foreground">{f}: </span>{fmtDiffValue(v)}</div>
      ))}
    </div>
  );
}

export function ChangeRequestsPanel({
  refreshSignal = 0,
  onApplied,
}: {
  // Incremented by the page when a new request is filed elsewhere (the
  // remarks dialog); the panel reloads so a fresh request shows at once.
  refreshSignal?: number;
  // Called after a decision commits so the page can reload the authoritative
  // sales list - an approved remarks change must be visible without a manual
  // refresh.
  onApplied?: () => void;
}) {
  const [requests, setRequests] = useState<ChangeRequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPrincipal, setIsPrincipal] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // NOTE: load never clears error/notice - a refusal message must stay
    // visible across the refresh that follows it (a failed decision used to
    // vanish when the list reloaded). Messages clear on the next user action.
    try {
      const result = await listChangeRequests(getSessionToken());
      if (result.success) setRequests(result.requests);
      else setError(result.message || "Could not load requests.");
      setIsPrincipal(await amIControlPrincipal(getSessionToken()));
    } catch (e: any) {
      setError(e?.message || "Could not load requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const firstSignal = useRef(true);
  useEffect(() => {
    if (firstSignal.current) { firstSignal.current = false; return; }
    void load();
  }, [refreshSignal, load]);

  async function decide(id: string, approve: boolean) {
    if (busy) return; // double-click guard
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await decideChangeRequest(id, { approve, note }, getSessionToken());
      if (result.success) {
        setNotice(result.alreadyDecided ? "Already decided earlier; recorded outcome shown." : approve ? "Approved and applied." : "Rejected.");
        setDeciding(null);
        setNote("");
        await load();
        if (approve && !result.alreadyDecided) onApplied?.();
      } else {
        // Conflict / stale record / expired session all surface here. Refresh
        // first so the list is current, THEN show the refusal - the message
        // must survive the refresh.
        await load();
        setError(result.message || "Decision refused.");
      }
    } catch (e: any) {
      setError(e?.message || "Decision failed.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await cancelChangeRequest(id, getSessionToken());
      if (result.success) await load();
      else setError(result.message || "Cancel refused.");
    } catch (e: any) {
      setError(e?.message || "Cancel failed.");
    } finally {
      setBusy(false);
    }
  }

  const badge = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: "bg-amber-100 text-amber-800",
      APPLIED: "bg-green-100 text-green-800",
      REJECTED: "bg-red-100 text-red-800",
      CANCELLED: "bg-gray-200 text-gray-700",
      CONFLICT: "bg-orange-100 text-orange-800",
    };
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] ?? "bg-gray-100"}`}>{status}</span>;
  };

  return (
    <Card className="mt-4">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Change requests (this device)</CardTitle>
        <Button variant="outline" size="sm" onClick={() => { setError(""); setNotice(""); void load(); }} disabled={loading}>{loading ? "Loading..." : "Refresh"}</Button>
      </CardHeader>
      <CardContent>
        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
        {notice && <div className="text-sm text-green-700 mb-2">{notice}</div>}
        {!loading && requests.length === 0 && !error && (
          <div className="text-sm text-muted-foreground">No change requests yet.</div>
        )}
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="border rounded-md p-3 text-sm space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{OPERATION_LABELS[r.operation] ?? "Change"} on sale {r.entityId.slice(0, 8)}</div>
                {badge(r.status)}
              </div>
              <div className="text-muted-foreground">
                by {r.requestedByName} · {new Date(r.createdAt).toLocaleString()}
              </div>
              <RequestValues r={r} />
              <div><span className="text-xs text-muted-foreground">Reason: </span>{r.reason}</div>
              {r.decidedByName && (
                <div className="text-muted-foreground">
                  decided by {r.decidedByName}{r.decisionNote ? ` - ${r.decisionNote}` : ""}
                </div>
              )}
              {r.status === "PENDING" && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {isPrincipal && (
                    deciding === r.id ? (
                      <>
                        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Decision note (optional)" className="h-8 w-56" />
                        <Button size="sm" onClick={() => decide(r.id, true)} disabled={busy}>Approve & apply</Button>
                        <Button size="sm" variant="destructive" onClick={() => decide(r.id, false)} disabled={busy}>Reject</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setDeciding(null); setNote(""); }} disabled={busy}>Back</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setDeciding(r.id)} disabled={busy}>Decide</Button>
                    )
                  )}
                  {r.mine && (
                    <Button size="sm" variant="ghost" onClick={() => cancel(r.id)} disabled={busy}>Cancel my request</Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
