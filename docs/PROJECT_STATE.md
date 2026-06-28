# MBM Quarry ERP — Project State

**Version**: v0.1.0-rc1
**Phase**: RC1 — Stabilization & Field Testing
**Last Updated**: 2026-06-27

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
| Sync Engine | ✅ Built — needs interactive validation at quarry |
| Electron Dev | ✅ Working |
| Electron Production (.dmg) | ✅ Built (macOS RC1) |
| Backup Manager | ✅ Complete |
| Settings Page | ✅ Complete |
| Auto-Updater | ⏸ Deferred (see D-011) |

## Current Task
Full QA validation pass at the quarry + real-world field testing.

## Blocking Issues
- Supabase sync requires `supabase_schema.sql` to be applied to the cloud project.
- Electron production build for **Windows** has not been packaged yet (only macOS DMG exists).

## Completed Phases
- Phase 0: Foundation (SQLite, Prisma, offline-first)
- Phase 1: Sales engine (business logic, payments, credit, vehicle trips, audit)
- Phase 2: Boulder Purchases
- Phase 3: Ledger + Day Book
- Phase 4: Credit & Collections
- Phase 5: Supabase Sync
- Phase 6: Electron Desktop Packaging
- RC1: Settings, Backup Manager, VERSION stamping, Documentation cleanup

## Idea Inbox
See `docs/IDEAS.md` for unconfirmed feature ideas.

## Next Confirmed Phases
- **Field Testing**: Deploy to quarry PC, collect feedback (1–2 weeks)
- **Phase 7**: Tally Integration (GST billing XML export) — after field testing
- **Phase 8**: Owner Dashboard (separate Next.js web app, read-only, Supabase-connected)
