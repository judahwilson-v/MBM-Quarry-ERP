# MBM Quarry ERP — Roadmap

## Released: RC1 (v0.1.0-rc1) — 2026-06-27

### Completed Features
- Offline-first SQLite ERP (Sales, Purchases, Ledger, Credit, Expenses, Reports)
- Double-entry financial event architecture
- Supabase cloud sync engine
- Electron desktop packaging (macOS DMG)
- Backup Manager (Backup / Restore / Export / Import)
- Global Settings page (Quarry Name, GST, Address, Phone, Printer, Backup Folder)
- Automated VERSION stamping on build
- About page with system health indicators

---

## Phase: Field Testing (In Progress)
- Deploy to quarry PC.
- Monitor real-world usage for 1–2 weeks.
- Log all bugs and UX issues to `docs/KNOWN_BUGS.md`.

---

## Phase 7: Tally Integration (Scheduled — after Field Testing)
- Generate Tally XML / CSV from sales data for GST filing.
- Configure automatic ledger matching.
- Add export workflow accessible from the Sales or Reports modules.

---

## Phase 8: Owner Dashboard (Scheduled — after Phase 7)
> A **separate** Next.js web app. Do not merge into the Electron ERP.

- Read-only dashboard connecting directly to Supabase.
- Authentication via Supabase Auth (owner account only).
- Features: Today's Sales, Monthly P/L, Cash Position, Party Ledger, Top Customers, Vehicle Trips, GST Summary, PDF/Excel exports.
- Sync Status widget: last sync time, pending changes, DB version.
- Responsive for desktop, tablet, and mobile.
- Full PRD at `docs/OWNER_DASHBOARD_PRD.md`.

---

## Phase 9: MBM Mobile (Future — not planned yet)
- Android / iOS app for on-the-go owner monitoring.
- Read-only, connected to Supabase.
- Push notifications for sales milestones.

---

## Ideas (Not Confirmed)
See `docs/IDEAS.md` for unconfirmed feature suggestions.
