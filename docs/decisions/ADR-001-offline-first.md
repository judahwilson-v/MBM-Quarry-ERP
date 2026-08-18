---
type: adr
last_updated: 2026-08-18
---
# ADR-001: Offline-First Architecture

## Context
The MBM Quarry ERP system must operate in a remote quarry environment where internet connectivity is frequently unreliable or completely unavailable. Maintaining uninterrupted business operations (such as generating weighbridge tickets, recording sales, and tracking inventory) is critical. System updates and application management must not interfere with business data, and there must be robust mechanisms to prevent accidental data loss.

## Decision
We are adopting an offline-first architecture with the following key components:

- **D-001: Offline-First SQLite**: SQLite is designated as the primary operational database for the application. Supabase is utilized purely as a secondary synchronization target. 
- **D-006: Data–Code Separation in Production**: The application source code and binaries reside in standard OS installation directories (`Program Files` on Windows, `.app` on macOS). User business data is stored separately in the user profile directory (`%APPDATA%/mbm-quarry-erp/quarry.db`).
- **D-013: Backup Strategy**: A dedicated Backup Manager (accessible via `/settings/about`) is implemented to create `.bak` snapshots within the user data folder. The system supports exporting data to a portable `.db` file, and importing data involves overwriting the active database only after explicit user confirmation.

## Alternatives Considered
- *Cloud-First Database (e.g., direct connection to PostgreSQL/Supabase)*: Rejected because cloud outages or internet drops would completely block daily quarry work.
- *Bundling Database with App Binaries*: Rejected because application upgrades would risk overwriting or corrupting the business data.
- *Automated Background Restores*: Rejected because it could silently overwrite active data, causing confusion or data loss. Explicit confirmation is safer for a quarry environment.

## Consequences
- The system is resilient to internet outages; quarry operations can proceed 100% offline.
- Application updates can be deployed confidently without risking user data.
- Users have full control over data backups and restoration, minimizing accidental data loss.
- Requires building and maintaining a robust synchronization layer to push/pull data with Supabase when connectivity is available.

## Immutability Rules
- The primary database must remain SQLite.
- Application upgrades must never touch the `%APPDATA%` user data folder.
- Importing backups must always require explicit user confirmation.
