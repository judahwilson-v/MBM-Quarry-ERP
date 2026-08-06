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

### 2026-08-05 — IoT Weighbridge Integration
- Summary: Direct RS-232/Ethernet integration with physical weighbridge indicators.
- Why it matters: Prevents manual entry errors and speeds up the ticketing process.
- Status: paused — put on hold per user request.

### 2026-06-27 — Prompt-based Idea Capture
- Summary: Allow the user to paste an idea in chat and have the AI store it in this inbox automatically.
- Why it matters: Keeps unconfirmed chat ideas out of the roadmap until explicitly approved.
- Status: approved — active governance rule for repository idea capture.

### 2026-06-27 — Future Phase Planning Notes
- Summary: Use this file as the official repository inbox for phase suggestions that are not yet committed.
- Why it matters: Prevents speculative feature ideas from mixing with approved phase implementation plans.
- Status: approved — active governance rule.
