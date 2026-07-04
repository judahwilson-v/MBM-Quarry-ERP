# Decisions

## Decision 001
Offline-first SQLite is the primary quarry database.
Reason: It must work without internet.

## Decision 002
Financial events are the source of truth for monetary actions.
Reason: Ledger, day book, reports, and dashboard are projections.

## Decision 003
Ledger and day book are rebuildable projections.
Reason: Recovery and replay must be deterministic.

## Decision 004
Supabase sync is secondary to local correctness.
Reason: Cloud must not break offline operations.

## Decision 005
Electron is the packaging/runtime layer for desktop deployment.
Reason: The quarry office needs a desktop app experience.

## Decision 006
Legacy SQLite data must be preserved and repaired in place.
Reason: Existing records are more important than clean migrations.
