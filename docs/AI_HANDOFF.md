# AI Handoff Guide

**Read this file first when starting a new session on this project.**

## Quick Start (5 Minutes)

1. Read `docs/PROJECT_STATE.md` — current version, phase, and blocking issues.
2. Read `docs/ROADMAP.md` — what is confirmed next.
3. Read `docs/KNOWN_BUGS.md` — known issues and quirks.
4. Inspect `src/` for the file you need to touch.
5. Read `docs/DECISIONS.md` if you are unsure *why* something was built a certain way.

## Operating Rules

- **Do not redesign the project**. Do not rewrite working features.
- **Continue from `docs/PROJECT_STATE.md`**. Do not invent new tasks.
- **Do not promote speculative ideas** into ROADMAP without explicit user approval. Save ideas to `docs/IDEAS.md`.
- If a doc conflicts with the codebase, verify the implementation. Update the doc only when the code change was intentional.
- All application code is in `src/`. All documentation is in `docs/`. All scripts are in `scripts/`.
- If resuming after a crash or model switch, start from `docs/PROJECT_STATE.md` and `docs/KNOWN_BUGS.md`.

## Current Operating Notes (2026-06-27)

- Application is stable as an Electron desktop app with SQLite persistence.
- Supabase sync is implemented but needs **interactive validation** before declaring it production-ready.
- A full QA pass at the physical quarry is required before new features are added.
- Windows production build has not been packaged yet — only macOS DMG exists.
- Auto-updater (`electron-updater`) is wired but **disabled** by design (see `docs/DECISIONS.md` D-011).

## Approved Architecture

```
Quarry PC (Electron + Next.js)
   ↓ SQLite (primary, offline-first)
   ↓ Sync Engine (background push/pull)
   ↓ Supabase (cloud mirror)
   ↓
Owner Dashboard (separate Next.js web app — Phase 8, not yet built)
```

## Key Files

| File | Purpose |
|------|---------|
| `main.js` | Electron main process — data path bootstrap, window creation |
| `src/lib/prisma.ts` | Prisma client singleton |
| `src/lib/offline-actions.ts` | Core server actions for data mutations |
| `src/lib/sync-engine.ts` | Supabase sync logic |
| `src/app/actions/` | Server actions per module |
| `prisma/schema.prisma` | Database schema source of truth |
| `scripts/stamp-version.js` | Auto-stamps VERSION file on build |
| `supabase_schema.sql` | Cloud DB schema (run once in Supabase SQL Editor) |
| `supabase_rls_policies.sql` | Supabase RLS policies |
