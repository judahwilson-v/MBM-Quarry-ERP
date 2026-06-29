# Roadmap

## Completed
- Foundation and schema normalization
- Sales business engine
- Authorization and audit
- Financial events
- Ledger projection
- Replay and reliability
- Day book
- Credit collections
- Reports and printing
- Electron desktop packaging
- Supabase sync foundation
- Backup manager
- Global settings

## Completed in Phase 1.0
- Build and type issues resolved.
- Prisma schema normalized without removing legacy data paths.
- Future database modules prepared in the schema.
- Shared server-action code tightened up.
- Documentation added for the current architecture and database layout.

## Current State
- RC1 is the current release baseline.
- Existing UI and offline SQLite workflow remain the default operation mode.
- Electron dev workflow and Supabase sync still need interactive validation.

## Verification Needed
- Electron dev workflow
- Supabase sync end-to-end
- Real production bug sweep

## Next
- Stabilize desktop/runtime workflow
- Verify cloud sync behavior
- Fix remaining bugs before Phase 2

## Next Phases
1. Phase 1.1 - Sales rewrite with business-correct rules.
2. Phase 1.2 - Financial event foundation.
3. Phase 1.3 - Day Book implementation.
4. Phase 1.4 - Credit and collections refinement.
5. Phase 1.5 - Reports.
6. Phase 2 - Supabase sync.
7. Phase 3 - Electron desktop.
