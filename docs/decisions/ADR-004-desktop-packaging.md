---
type: adr
last_updated: 2026-08-18
---
# ADR-004: Desktop Packaging and Deployment

## Context
The primary users of the ERP are quarry office staff who expect and require a robust, native desktop application experience. The deployment process must be streamlined, and the interface must remain uncluttered. At the same time, quarry owners require remote access to system metrics and reports without needing the full desktop application installed on their personal devices.

## Decision
We architect the application delivery and interface hierarchy as follows:

- **D-005: Electron for Desktop Packaging**: The main quarry application is delivered as an Electron desktop application that wraps a Next.js standalone server.
- **D-011: Auto-Updater Active**: The `electron-updater` infrastructure is fully configured and tied to GitHub Releases to manage application updates seamlessly.
- **D-012: Owner Dashboard Separation**: The Owner Dashboard is developed as a separate Next.js web application that connects directly to the Supabase cloud database. It is explicitly kept out of the main Electron ERP application.
- **D-014: Consolidated Settings Hierarchy**: System configuration interfaces—including diagnostics, backups, sync tools, user logs, and export settings—are grouped under a `/settings/*` route utilizing tabbed navigation.

## Alternatives Considered
- *Pure Web Application for the Quarry*: Rejected due to the offline-first requirement (D-001) and the need for local file system access (e.g., backups).
- *Integrating Owner Dashboard into Electron App*: Rejected because it bloats the desktop application and forces owners to install the desktop app just to view reports.
- *Scattered Settings Menus*: Rejected because it creates UI clutter and makes it difficult for operators to find critical administrative tools.

## Consequences
- Quarry staff receive a reliable, native-feeling application that updates automatically.
- Owners can access real-time metrics remotely via a lightweight web interface.
- The application sidebar remains clean and focused on daily operational tasks.
- The development team must maintain two separate codebases/deployment pipelines (Electron App and Owner Dashboard Web App).

## Immutability Rules
- The Owner Dashboard must never be merged into the Electron ERP codebase.
- All administrative and system tools must reside within the `/settings/*` hierarchy.
- The desktop app must be distributed via Electron with active auto-updating.
