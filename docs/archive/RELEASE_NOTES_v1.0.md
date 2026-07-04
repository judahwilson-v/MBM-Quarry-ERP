# MBM Quarry ERP - Release Candidate 1 (RC1)

## Overview
MBM Quarry ERP v1.0.0-rc.1 marks the first feature-complete milestone of the offline-first desktop application. The system is now stabilized, containerized via Electron, and backed by a local SQLite database with offline-first background synchronization to Supabase.

## Key Features Complete
- **Core Modules**: Sales, Boulder Purchases, Vehicles, Parties, Materials, Expenses, Party Ledger, and Employee Credit.
- **Reporting**: Daily Day Book generation and customizable multi-format reports.
- **Data Integrity**: 
  - Complete double-entry accounting ledger system backing all financial actions.
  - Safe editing/patching logic for older ledger entries to prevent historical drift.
- **Cloud Sync**: 
  - Automated offline-first push-pull sync engine to Supabase.
  - Persistent queue system ensuring zero data loss during internet outages.
- **Settings & Backups**:
  - Global Business Settings UI.
  - Full-featured Backup Manager (Backup, Restore, Export, Import) directly from the About page.
- **Desktop Packaging**:
  - Seamless Next.js standalone integration wrapped within a secure, context-isolated Electron window.
  - Data separation ensuring business SQLite databases safely persist across app upgrades.

## Pre-Deployment Verification Passed
- ✓ Strict TypeScript compilation (0 errors)
- ✓ ESLint compliance
- ✓ SQLite Prisma generation
- ✓ Offline data creation testing
- ✓ Synchronization conflict handling

## Next Steps
- **Quarry Deployment**: Begin installing on the primary quarry PC.
- **Field Testing**: 1-2 weeks of real-world load testing.
- **Phase 8**: Post-stabilization rollout of the read-only web-based Owner Dashboard.
