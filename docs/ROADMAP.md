# MBM Quarry ERP — Roadmap

## Released: v1.9.0 — 2026-06-27

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

## Phase 8: Refinement, Sync Validation & UI Polish (Current Phase)
- Fix auto-updater and confirm remote desktop updates (Completed v1.9.0).
- Run full local tests and QA.
- Remove any unwanted features or clutter.
- Verify 100% of data is correctly saving/syncing to Supabase.
- Add any missing features needed for daily operations.
- Make the UI better, cleaner, and more polished.

---

## Phase 8.5: Dynamic System Automation
- Automate hardcoded system details in `About` page.
- Make Database Schema version dynamically read from Prisma/Migrations so any table update reflects automatically.
- Make Cloud Sync connection and SQLite connection status dynamic and real-time.

---

## Phase 9: Owner Dashboard Web App (Scheduled)
> A **separate** Next.js web app. Do not merge into the Electron ERP.

- Read-only dashboard connecting directly to Supabase.
- Authentication via Supabase Auth (owner account only).
- Features: Today's Sales, Monthly P/L, Cash Position, Party Ledger, Top Customers, Vehicle Trips, GST Summary, PDF/Excel exports.
- Sync Status widget: last sync time, pending changes, DB version.
- Responsive for desktop, tablet, and mobile.
- Full PRD at `docs/OWNER_DASHBOARD_PRD.md`.

---

## Ideas (Not Confirmed)
See `docs/IDEAS.md` for unconfirmed feature suggestions.
