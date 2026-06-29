# Architecture

MBM is organized as:

UI
→ Application Actions
→ Domain Services
→ Projections and Persistence
→ SQLite
→ Optional Supabase Sync
→ Electron Desktop Shell

Core invariants:
- Business logic belongs in domain services.
- Facts are immutable.
- Projections are rebuildable.
- Offline operation must remain functional.
- New features should reuse existing services whenever possible.
