# DECISIONS (Architecture Decision Record)

## ADR 1: SQLite for Offline-First
**Context:** Quarries often operate in remote areas with poor or zero internet connectivity. A pure web-app would fail.
**Decision:** We use a local SQLite database running on the user's machine as the absolute source of truth for daily operations.
**Consequences:** Enables 100% offline functionality. However, it requires a complex sync engine to push data to a cloud PostgreSQL (Supabase) later.

## ADR 2: Electron + Next.js Standalone
**Context:** We need to distribute a Windows Desktop App using modern web technologies.
**Decision:** We compile Next.js in standalone mode and wrap it in Electron. Electron spawns a local Node server to serve the Next.js app on port 4000.
**Consequences:** Allows us to reuse React/Next.js knowledge for a desktop app. Requires careful management of the local Node server lifecycle and handling startup timeouts.

## ADR 3: Inventory Integration inside Offline Actions
**Context:** We added a physical stock inventory system. When a sale is made, stock must be deducted.
**Decision:** Instead of relying on client-side API chaining, we hooked 	xAdjustInventoryStock directly into the db. block of saveSale in offline-actions.ts.
**Consequences:** Guarantees atomic updates. If a sale fails to save, the inventory is not deducted. Ensures perfect data consistency without manual entry.
