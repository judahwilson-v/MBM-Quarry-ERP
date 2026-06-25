# MBM Phases

This document tracks the implementation roadmap and completion checklist for MBM.

## Source-of-Truth Documents

- [MBM_BUSINESS_SPEC.md](/Users/judahvijaiwilson/Website/github%20/project%20ig/MBM1/docs/MBM_BUSINESS_SPEC.md)
- [MBM_DATABASE_SPEC.md](/Users/judahvijaiwilson/Website/github%20/project%20ig/MBM1/docs/MBM_DATABASE_SPEC.md)
- [MBM_UI_SPEC.md](/Users/judahvijaiwilson/Website/github%20/project%20ig/MBM1/docs/MBM_UI_SPEC.md)

## Completed

- Phase 1.0 - Foundation and database normalization.

## Planned

- Phase 1.1 - Sales rewrite.
- Phase 1.2 - Purchases.
- Phase 1.3 - Day Book.
- Phase 1.4 - Credit and collections.
- Phase 1.5 - Owner dashboard.
- Phase 2 - Supabase sync.
- Phase 3 - Electron desktop.

## Phase 1.1 Breakdown

- Phase 1.1A - Sales database and business logic.
- Phase 1.1B - Sales UI.
- Phase 1.1C - Edit/delete protection and audit logging.
- Phase 1.1D - Vehicle trip counting and automatic credit updates.
- Phase 1.1E - Final testing and documentation.

## Completion Checklist

- Business rules documented before code changes.
- Database changes approved before UI changes.
- Edit protection and audit semantics approved before mutation wiring.
- Vehicle trip logic verified against examples.
- Build passes before phase completion is marked.
