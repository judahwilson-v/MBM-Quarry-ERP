// ISS-02: after a ledger write, the summary row captured at click time is stale.
// The Party Ledger heading (and Excel export) render from `selectedParty`, so the
// selected row must be rebuilt from the freshly loaded summary.
//
// Bounded semantics, grounded in listPartiesWithBalances (src/app/actions/credits.ts):
// - "refreshed": the fresh summary still lists the party; use that row.
// - "settled": the party dropped out of the summary. That query filters
//   `balance != 0`, so absence after a write means the balance is now 0. The
//   truthful heading is 0, keeping the user in the ledger they were viewing.
// - "stale-fallback": the summary reload itself failed (rows undefined); keep the
//   previous row so the entries view still refreshes (pre-fix behavior on error).

export interface PartySelectionIdentity {
  id: string;
  partyName: string;
  balance: number;
}

export type SelectedPartyResolution<T extends PartySelectionIdentity> =
  | { kind: "refreshed"; party: T }
  | { kind: "settled"; party: T }
  | { kind: "stale-fallback"; party: T };

export function resolveSelectedPartyAfterRefresh<T extends PartySelectionIdentity>(
  rows: readonly T[] | undefined,
  previous: T
): SelectedPartyResolution<T> {
  if (!rows) return { kind: "stale-fallback", party: previous };
  const fresh = rows.find((row) => row.id === previous.id);
  if (fresh) return { kind: "refreshed", party: fresh };
  return { kind: "settled", party: { ...previous, balance: 0 } };
}

// ISS-02 v2 error honesty: after a committed write whose summary reload FAILED,
// the last known balance is UNVERIFIED, not merely old. The heading must say so
// instead of showing the stale number as current truth, and exports/prints must
// not present an unverified balance as the closing balance.
export function canExportOrPrintLedger<T extends PartySelectionIdentity>(
  summaryStale: boolean,
  selectedParty: T | null
): selectedParty is T {
  return !summaryStale && !!selectedParty;
}
