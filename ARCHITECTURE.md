# ARCHITECTURE

## Overview
MBM Quarry ERP is an offline-first Windows Desktop application built for quarry management.

## Tech Stack
*   **Desktop Wrapper:** Electron
*   **Frontend & API:** Next.js (compiled to standalone mode)
*   **Database ORM:** Prisma
*   **Local Database:** SQLite (for offline-first operation)
*   **Cloud Backend:** Supabase (PostgreSQL) for future cloud synchronization

## Critical Architecture Rules
1.  **SQLite is the Source of Truth:** While offline, the local SQLite database (quarry.db or local.db depending on the environment) is the absolute source of truth.
2.  **Prisma is Sacred:** Do not remove or replace Prisma without explicit instruction.
3.  **Schema Stability:** Do not change table names, primary keys, or relationships unless a migration is explicitly required and approved.
4.  **Backward Compatibility:** Always preserve backward compatibility with existing local databases to prevent data loss or startup crashes.
5.  **Sync Contract:** Never break the sync contract between SQLite and Supabase.
6.  **Electron Packaging:** The Next.js app is bundled into the Electron app using the standalone output mode. The Prisma engine and local database must be explicitly included in the extraResources of the electron-builder configuration.
