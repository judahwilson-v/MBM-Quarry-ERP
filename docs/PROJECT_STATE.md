# MBM Quarry ERP — Project State

**Status**: Cloud-Synced (Active Deployment)
**Version**: `v1.10.1`
**Phase**: RC1 — Stabilization & Field Testing
**Last Updated**: 2026-07-06

## Status
| Area | Status |
|------|--------|
| Sales | ✅ Complete |
| Boulder Purchases | ✅ Complete |
| Vehicles Master | ✅ Complete |
| Parties Master | ✅ Complete |
| Materials Master | ✅ Complete |
| Expenses | ✅ Complete |
| Party Ledger | ✅ Complete |
| Employee Credit | ✅ Complete |
| Other Credit | ✅ Complete |
| Reports | ✅ Complete |
| Sync Engine | ✅ Complete (Anonymous Sync — RLS Disabled) |
| Electron Dev | ✅ Working |
| Electron Production | ✅ Built (macOS DMG & Windows EXE) |
| Backup Manager | ✅ Complete |
| Settings Page | ✅ Complete |
| Auto-Updater | ✅ Complete (React UI with manual/auto support) |

## Current Task
Full QA validation pass at the quarry + real-world field testing.

## Blocking Issues
- None at this time.

## Completed Phases
- Phase 0: Foundation (SQLite, Prisma, offline-first)
- Phase 1: Sales engine (business logic, payments, credit, vehicle trips, audit)
- Phase 2: Boulder Purchases
- Phase 3: Ledger + Day Book
- Phase 4: Credit & Collections
- Phase 5: Supabase Sync
- Phase 6: Electron Desktop Packaging (Windows & macOS)
- Phase 7: Tally Integration (GST billing XML export)
- Phase A: Robust Cloud Sync, Live Operational Dashboards, and Real-Time Health Diagnostics
- RC1: Settings, Backup Manager, VERSION stamping, Documentation cleanup

## Idea Inbox
See `docs/IDEAS.md` for unconfirmed feature ideas.

## Next Confirmed Phases
- **Field Testing**: Deploy to quarry PC, collect feedback (1–2 weeks)
- **Phase 8**: Refinement, Sync Validation & UI Polish (Current Focus)
- **Phase 9**: Owner Dashboard (separate Next.js web app, read-only, Supabase-connected)
