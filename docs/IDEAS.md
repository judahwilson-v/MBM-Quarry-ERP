# MBM Quarry ERP — Ideas Inbox

Use this file to capture unconfirmed feature ideas, rough thoughts, and speculative notes.

**Do not promote entries here to ROADMAP without explicit user approval.**

Format each entry as:
```
### YYYY-MM-DD , time — Idea Title  
- Summary:
- Why it matters:
- Status: draft | discussed | approved | rejected
```

---

### 2026-06-27 — Auto-Updater via GitHub Releases
- Summary: Use `electron-updater` to automatically push application updates to the quarry PC.
- Why it matters: Removes the manual "copy new .exe" workflow.
- Status: discussed — approved in principle, deferred until RC1 is validated at quarry (see D-011).

### 2026-06-27 — Owner Dashboard (Phase 8)
- Summary: Separate Next.js web app, read-only, connected to Supabase. For owner to monitor quarry remotely.
- Why it matters: Gives the business owner visibility without exposing the ERP to the internet.
- Status: approved — documented in `docs/OWNER_DASHBOARD_PRD.md`, scheduled as Phase 8.

### 2026-06-27 — MBM Mobile App (Phase 9)
- Summary: Android/iPhone app for on-the-go owner monitoring and approval of key actions.
- Why it matters: Completes the three-app architecture (ERP + Dashboard + Mobile).
- Status: draft — not planned, no timeline.

### 2026-06-27 — Tally Integration (Phase 7) 
- Summary: Generate Tally-compatible XML/CSV exports from sales data for GST filing.
- Why it matters: Quarry accountant uses Tally ERP 9 / Tally Prime.
- Status: rejected — scheduled as Phase 7, after field testing.
