# MBM Quarry ERP — Changelog

## v2.4.7 — Database & Synchronization Overhaul (2026-08-28)
- **Transactional Outbox Engine (Phases 4–5)**: Replaced fragile audit-log CDC synchronization with an ACID-compliant transactional outbox pattern (`sync_outbox_events`). Every business write atomically enqueues an immutable outbox event inside the same SQLite transaction, eliminating lost sync records, shadow mutations, and race conditions.
- **Idempotent Cloud RPC Ingestion**: Built server-side `apply_outbox_event()` PostgreSQL RPC with durable event deduplication (`sync_event_inbox`), ensuring retry attempts and interrupted network reconnections never create duplicate records or conflict corruptions.
- **Durable Local Device Identity**: Added hardware-anchored device registration (`device_identities`) persisted across SQLite upgrades, guaranteeing traceable multi-device event routing.
- **Strict Sync Lease Mutual Exclusion**: Implemented unified in-memory and state-backed lease management (`withSyncLease`) preventing concurrent pushes, pulls, restores, and outbox dispatches from colliding.
- **Safe Staged Restore Engine (Phase 3)**: Replaced destructive in-place restore with an isolated staging database workflow (`.stage.db`). Automatically generates timestamped `.bak` pre-restore backups, validates foreign keys and row counts in staging, and executes atomic 3-way file swaps with journal recovery (`restore-files.ts`).
- **Versioned Local Migration Runner (Phase 1)**: Built a deterministic DDL migration pipeline (`schema_migrations`) executing migrations v1 through v5 on startup, guaranteeing schema synchronization between Prisma models and SQLite without data loss.
- **Observability, Health Contracts & Diagnostics (Phase 6)**: Added pure read-only health metrics (`getDetailedSyncHealth`), outbox delivery queues, retry distribution tracking, and structured diagnostics export with full credential/PII sanitization.
- **Unsafe Sync Operations Retired**: Safely retired brute-force table scanning (`forcePushAllTables`) and timestamp rewinds (`resetSyncCursor`, `resetSyncQueue`) with typed `RETIRED_OPERATION` responses, eliminating collision merge suffixes (`(Merge XXXX)`).
- **Domain Cutover Gate (Material Pilot)**: Successfully cut over `Material` master data to outbox delivery with shadow reconciliation and fail-closed legacy fallbacks.

## v2.4.6 — Spreadsheet Inline Editing & Sync Reliability Fixes (2026-08-19)
- **Global & Local Keyboard Shortcuts**: Implemented dedicated keyboard shortcuts to speed up data entry. Added local form shortcuts (`Ctrl+S` to save, `Ctrl+N` to start new, `Esc` to cancel) specifically mapped to the Sales and Boulders tables. Added global navigation hotkeys (`Alt+S` for Sales, `Alt+B` for Boulders, `Alt+V` for Vehicles) to allow instant jumping between high-traffic modules from anywhere in the app.
- **Spreadsheets-style Inline Table Editing**: Added highly requested Excel-like inline editing directly into the Outgoing Sales and Incoming Boulder tables. Users can click any cell (like Qty, Rate, Discount, Remarks) to edit it instantly. Features a full keyboard navigation engine (Enter to save and move down, Arrow Keys to move around, Tab to switch columns) and a robust **15-Minute PIN Cache** so users only need to authenticate once per editing session instead of every single cell.
- **Inventory Material Normalization & Deduplication**: Standardized and normalized material naming in `adjustInventoryStock` and `txAdjustInventoryStock` to canonical uppercase formatted strings (e.g. `20mm` -> `20 MM`), preventing duplicate entries in `inventory_stock`. Merged existing duplicate records and consolidated transaction histories in local SQLite.
- **Reliable Push Sync & Direct Table Scanning**: Expanded direct table scanning during push sync from 4 tables to all 29 business tables, bypassing the fragile audit log queue mechanism to ensure data never stays local-only if the cursor skips forward. Fixed diagnostic pending counts for aliased models (e.g., "Sale" -> "OutgoingSale") and added a robust "Force Push All Data" UI button backed by an idempotent upsert engine to instantly recover any missing cloud records.
- **Employee Help & Training UI**: Added a dedicated "Help & Training" page in the Settings navigation to assist non-technical staff. Includes simplified, plain-English explanations of all sync operations, clear warnings for destructive actions (like Full Restore), and everyday operating rules.
- **Table Date Filtering**: Added quick date pickers to the top of both the Outgoing Sales and Incoming Boulder tables. Users can now easily filter records by a specific day directly from the UI, and Excel exports will correctly respect the active date filter.

## v2.4.5 — Sync Restore Data Comparison (2026-08-18)
- **Read-Only Restore Compare**: Added a new Diff Engine and "Compare Data" UI that allows users to safely preview exactly which records will be lost, added, or modified before proceeding with a destructive Full Server Restore.

## v2.4.4 — UI Polish (2026-08-18)
- **Duplicate Warning Fix**: Removed redundant emoji and warning text in the Sync Restore dialog.

## v2.4.3 — GitHub Actions CI/CD Pipeline Race Condition Fix (2026-08-18)
- **Electron Builder Race Condition Fix**: Completely resolved a `422 Validation Failed` and `tag_name already exists` CI error. By reverting `releaseType` to `draft` in `package.json` and pre-creating the draft release in `.github/workflows/release.yml`, we guarantee that `electron-builder` sequentially uploads assets (`latest.yml`, `.exe`) to the pre-created draft without attempting to create duplicate releases concurrently, ensuring a rock-solid, atomic auto-update deployment.

## v2.4.2 — GitHub Actions CI/CD Pipeline Hotfix (2026-08-18)
- **PowerShell Exit Code Propagation Fix**: Fixed a bug where `gh release view` returning exit code 1 (when no pre-existing release was found) was being propagated by PowerShell and killing the release workflow, preventing `electron-builder` from generating the update artifacts. Added explicit `exit 0` to workflow steps.

## v2.4.1 — Release Pipeline Hardening (2026-08-17)
- **Electron Builder Conflict Resolution**: Updated `.github/workflows/release.yml` to explicitly delete any pre-existing tags or releases before `electron-builder` runs. This prevents the `422 Unprocessable Entity "already_exists"` error that detached `latest.yml` from the GitHub release.
- **Mandatory Asset Verification**: Added post-build workflow assertion to fail the build if `latest.yml` is missing, preventing silent deployment failures.

## v2.4.0 — Full Server Restore & Disaster Recovery (2026-08-17)
- **Full Server Restore Engine**: Built a new `fullRestoreFromSupabase()` engine that allows cloning an entire quarry database from Supabase to a fresh local PC. The engine wipes local data in strict reverse-foreign-key order, then downloads all 28 tables using offset pagination to bypass REST limits.
- **Sync Dashboard Recovery UI**: Added a new "Restore from Server" section to the Sync Dashboard. Includes a multi-phase managed dialog with a pre-flight eligibility check, per-table row counts, existing data overwrite warnings, and progress indicators.
- **Automated Cursor Healing**: The restore engine automatically resets push and pull sync cursors to `now()` after a successful restore so that incremental CDC sync works flawlessly going forward.

## v2.3.1 — System Reliability Update (2026-08-16)
- **Compulsory 5-Asset Distribution**: Fully enforced upload and verification of all 5 release artifacts on GitHub (`latest.yml`, `MBM-Quarry-V2-Setup-X.Y.Z.exe`, `MBM-Quarry-V2-Setup-X.Y.Z.exe.blockmap`, `Source code (zip)`, `Source code (tar.gz)`).
- **Delta Chunk Binary Optimization**: Ensured the `.blockmap` differential file is permanently attached to releases to enable fast partial-chunk delta downloads for quarry desktop clients.
- **Continuous Artifact Assertion**: Configured automated GitHub Actions post-build assertion to verify that all assets are present before completing the release.

## v2.3.0 — Auto-Updater Pipeline Hardening & Release Synchronization (2026-08-16)
- **Auto-Updater Release Synchronization**: Fixed root cause of 404 errors on `latest.yml` where duplicate draft releases caused release metadata to detach from GitHub releases. Reconfigured `electron-builder` to publish directly with `releaseType: "release"` so `latest.yml`, installer `.exe`, and blockmap files are atomically published to GitHub releases in a single pass.
- **CI/CD Release Workflow Simplification**: Streamlined `.github/workflows/release.yml` by removing conflicting draft release steps and adding an automatic artifact verification step (`gh release view`).
- **Defensive Error Handling in Desktop Updater**: Added safe error parsing and graceful failure handling in `desktop/main.js` so network glitches or missing metadata do not disrupt user workflows or crash the desktop client.

## v2.2.0 — ACID Atomicity Fixes, Next.js Boot Fix & Structural Refactoring (2026-08-16)
- **ACID Transaction Atomicity Fixes**: Removed swallowed `try/catch` wrappers around relational cleanup hooks (e.g., `decrementVehicleTrips`, `recalculatePartyLedger`, `txAdjustInventoryStock`) across all domain actions. This allows Prisma to natively abort and rollback the `$transaction` on error, ensuring ledgers and inventory remain in perfect parity.
- **Next.js Boot Sequence Fix**: Converted the dynamic `require("./generated/bootstrap-ddl.json")` in `bootstrap.ts` to a static ES6 import, permanently resolving the Next.js timeout crash during Electron boot in production.
- **UI Consistency & Dialog Prompts**: Replaced legacy blocking native `confirm()` and `prompt()` browser dialogs on the Employees page with the internal React-driven `@/components/ui/prompt-provider`.
- **Route Orchestration & Cleanups**: Cleaned dead imports, deleted the orphaned `src/app/settings/users/` directory, and properly co-located 5 out-of-tree settings components into `src/app/settings/general/`.
- **Verification & Pipeline Checks**: All static analysis passing. Passed all tests, `tsc --noEmit` checks, and ESLint checks with zero warnings/errors.

## v2.1.0 — Architecture Polish & Build Fixes (2026-08-16)
- **Build Architecture**: Resolved broken imports in settings/general and sync route.
- **Data Deprecation**: Removed deprecated time field from data schemas to enforce unified datetime standards.

## v2.0.0 — Master Quality, Resilience & UI Polish Overhaul (2026-08-16)

- **Defensive Error Handling & Deletion Safeguards (Task 1 & 5)**:
  - Added robust defensive `try/catch` wrappers around all relational cleanup hooks in `sales.ts` (`deleteSale`), preventing cascade failures and allowing safe deletion of orphaned or test records.
  - Fixed `purgeNonGstSales` to restore inventory per item before deletion, generate individual audit log entries for Supabase sync, and return structured errors instead of throwing.
- **Financial Controls & Quick-Pay UX (Tasks 2, 3 & 4)**:
  - Displayed explicit `Cash`, `Bank/GPay`, `Paid`, and `Credit` columns with formatted values and conditional credit highlight colors in the Outgoing Sales table.
  - Implemented one-click quick-pay shortcut pills (`Full Cash`, `Full GPay`, `Full Bank`, `Full Credit`) in both Sales and Boulder purchase forms.
  - Added interactive vehicle body quantity selector (`🚛 Company Body` vs `📦 Extra Body`) to prevent invalid quantity deviation warnings when selecting standard body configurations.
- **Physical Book/Page Synchronization & Reordering (Tasks 6 & 8)**:
  - Linked physical receipt book and page counters across Sales and Incoming Boulder modules, adding duplicate warning prompts with explicit force-commit support.
  - Streamlined Boulder purchases table and form layout, deprecating the legacy time input and ordering columns logically by physical book identifier first.
- **Audit Logging & User Traceability (Task 9)**:
  - Bound active operator identity (`userName`) to Day Book transaction entries and audit events, rendering operator identity alongside timestamps in ledger feeds (`{time} • {userName}`).
- **Data Table Ergonomics & Horizontal Scrolling (Task 10)**:
  - Integrated sticky first columns (`Date`, `Vehicle`, `Party`, `Type`) with hover background preservation across all dense data tables: Outgoing Sales, Incoming Boulder, Party Ledger, Employee Ledger, and Fuel Management.
- **Settings Hierarchy & Navigation (Task 11)**:
  - Reorganized `/settings` with dedicated sub-tabs (`System Diagnostics & Reliability`, `About & Backup`, `Sync Dashboard`, `User Logs`, `Tally Export`).
  - Added "Coming Soon" overlay banner for Tally ERP export and streamlined sidebar navigation down to 16 core operational routes.
- **Full-Spectrum Dark Mode Contrast Audit**:
  - Resolved all 8 light-mode contrast anomalies across sales GST rows, badges, opening/closing balance summary cards, login form inputs, party ledger dialogs, backup manager alerts, and audit viewer tags.

## v1.16.5 — Single Source of Truth, Automated Test Suite & CI/CD Pipeline (2026-08-14)
- **Single Source of Truth Architecture**:
  - Consolidated schema management to `prisma/schema.prisma` as the primary source of truth.
  - Added automated generator pipeline in `prebuild` (`generate-bootstrap-ddl.js`, `generate-pg-schema.js`, `generate-supabase-sql.js`, `generate-sync-map.js`).
  - Refactored `src/lib/bootstrap.ts` from 794 lines to 290 lines, dynamically loading auto-generated DDL from `src/lib/generated/bootstrap-ddl.json`.
- **Automated Drift Detection & Test Suite**:
  - Integrated Vitest test runner with 17 tests across `tests/schema-consistency.test.ts` (drift detection across Prisma, SQLite bootstrap, sync-map, and Postgres) and `tests/sync-completeness.test.ts`.
- **CI/CD Pipeline**:
  - Added GitHub Actions workflow (`.github/workflows/ci.yml`) for automated testing, type checking, and build validation on every push.
- **Security & Repository Sanitization**:
  - Untracked `.env` and `.env.production` from Git tracking and updated `.gitignore` to strictly ignore all `.env*` credentials except `.env.example`.
  - Resolved UI delete handler error handling across master data, credits, fuel, and employee pages.


## v1.16.3 — Sync Engine Cookie Fix, Animated Splash Screen & Agent Rules (2026-08-14 08:37 AM)
- **Sync Engine Cookie Fix**: Introduced `createSyncClient` in `src/lib/supabase/client-sync.ts` using standard `@supabase/supabase-js` without Next.js `cookies()`, fixing `cookies was called outside a request scope` crash during background sync loop operations.
- **Valorant-Style Animated Splash Screen**: Created `desktop/splash.html` and updated `desktop/main.js` to display an animated dark/red theme loading splash screen showing live status transitions (e.g. database loading, Next.js engine booting) during desktop app startup.
- **Background Tasks Agent Rule**: Added rule file `.agents/rules/supabase-background-tasks/RULE.md` to prevent future AI agents from using cookie-based clients in non-request scoped background loops.

## v1.16.2 — Sync Deadlock Resolution & Artifact Removal (2026-08-13 07:56 PM)
- **Sync Deadlock Resolution**: Fixed critical deadlock in `sync-service.ts` where FK violations caused `recordSkippedTime()` to permanently pin the `lastSyncedAt` cursor in the past, causing an infinite loop. The sync engine now safely advances the cursor past failing records.
- **Root Directory Cleanup**: Moved 15 un-nested root scratch and test scripts (`check_*.js`, `add_*.js`, `test_*.js`, `fix_*.js`) into the designated `scratch/` directory.
- **Artifact Removal**: Removed stale `latest.yml` root artifact and added it to `.gitignore` to prevent future build pollution.

## v1.16.1 — Party Ledger Optimization, Non-Blocking Sync & Partial Sync UX (2026-08-13)
- **Party Ledger Bulk Creation**: Replaced sequential N+1 `create` queries in `recalculatePartyLedger` with bulk `createMany` operation to accelerate balance recalculations.
- **Non-Blocking Background Auto-Sync**: Wrapped `triggerAutoSync()` in non-blocking `setTimeout(..., 0)` calls across server actions to prevent local UI response latency from blocking on background Supabase sync network calls.
- **Partial Sync State Handling**: Added `PARTIAL_SUCCESS` status tracking to `pushSync()` and `pullSync()` in `sync-service.ts` and updated `app-shell.tsx` header indicator for improved UI feedback during row-level quarantine events.

## v1.16.0 — Cross-Validation Audit & Defect Remediation (2026-08-07)
- **Milestone 1: Supabase Index Matching**:
  - Matched all `@@index` annotations in `schema_pg.prisma` with Supabase schema indices.
- **Milestone 2: Form Validation Alignment**:
  - Fixed sequence rollover logic in `sales-entry-form.tsx` to strictly use 100-page rollover.
- **Milestone 3: Engine Hours Constraint**:
  - Enforced `num >= 0` constraint in `schemas.ts` to prevent negative engine hours entries.
- **Milestone 4: Defect Remediation**:
  - Resolved and cataloged KB-029 and KB-030 in `KNOWN_BUGS.md`.
- **Milestone 5 & 6: Verification & Desktop Package**:
  - Successfully verified build and packaged Windows executable `MBM Quarry V2 Setup 1.16.0.exe`.

## v1.15.0 — Permanent Sync Engine Fixes & Topological Dependency Architecture (2026-08-06)
- **Milestone 1: Cloud Schema & Root Cause Resolution**:
  - Added missing tables `weighbridge_tickets`, `maintenance_records`, `maintenance_schedules`, and `vehicle_stats` to cloud PostgreSQL schema (`prisma/schema_pg.prisma`) and SQL migration script (`docs/supabase_sync_fix_RUNME.sql`).
  - Added `@map("ticket_type")` mapping to `WeighbridgeTicket.ticketType` field in Prisma schema to resolve PostgREST database column naming mismatches.
  - Fixed numeric arithmetic for `ticketNumber` ID assignment in `sync-service.ts` to send genuine integer values instead of string-concatenated values, eliminating PostgREST integer syntax errors.
- **Milestone 2: Multi-Tier Error Boundaries & Adaptive UI Polling**:
  - Installed 3 tiers of error boundaries (Service level, Table level in `pullSync()`, and Row level in `pushSync()` and `pullSync()`) returning structured `SyncResult` summary objects `{ pushed, pulled, skipped, errors, status }`.
  - Guaranteed that fatal row or table errors never crash the sync engine or block healthy tables, quarantining poison pill rows in `SyncDeadLetter` and advancing sync cursors safely.
  - Updated UI polling in `src/components/app-shell.tsx` with adaptive exponential backoff (10s base up to 5 minutes max) on sync errors to prevent tight polling loops.
- **Milestone 3: Constraint Audit, Topological Order & FK Holding Queue**:
  - Enforced a 29-table parent-first topological dependency order via `PUSH_PRIORITY` map (1..29) and `PULL_ORDER` array in `src/lib/sync/sync-config.ts`, ensuring parent records (e.g. `OutgoingSale`) are always processed before child records (e.g. `PartyCredit`).
  - Expanded `REMOTE_CONFLICT_COLUMNS` and `LOCAL_CONFLICT_FIELDS` to cover all 29 models (including 16 unique-constrained models like `vehicle_number`, `party_name`, `ticket_number`, `serial_number`, `source_event_id`).
  - Implemented an FK Holding Queue with up to 3 retry passes within `pushSync()` for child records awaiting parents, bounded by `earliestSkippedTime` cursor tracking so `lastSyncedAt` never skips un-pushed records.
  - Fixed ISO date parsing regex in `toCamelCase()` to support `Z` and timezone offsets (e.g. `+05:30`), and introduced a 10-second safety window (`SAFETY_WINDOW_MS = 10000`) subtracted from sync cursors to protect against device clock skew.
- **Milestone 4: Verification & Final Quality Assurance**:
  - Verified clean TypeScript compilation (`npx tsc --noEmit`) with **0 errors**.
  - Verified clean ESLint check (`npx eslint src/ --quiet`) with **0 errors**.
  - Synchronized all project documentation files (`KNOWN_BUGS.md`, `PROJECT_STATE.md`, `CHANGELOG.md`).

## v1.14.0 — Multi-Tier Error Boundaries & Architectural Resilience (2026-08-06)
- **Multi-Tier Error Boundaries**: Refactored `pushSync()` and `pullSync()` in `src/lib/sync/sync-service.ts` to implement 3 tiers of error isolation (Service level, Table level in `pullSync()`, and Row level in `pushSync()`/`pullSync()`).
- **Structured Summary Result (`SyncResult`)**: Both `pushSync()` and `pullSync()` now return `{ pushed, pulled, skipped, errors, status }` without throwing uncaught fatal exceptions to callers.
- **Row Quarantine & Progressive Cursor Advancement**: Bad rows or corrupt payloads log errors to the summary list and update database status, skipping the single item while safely advancing `lastSyncedAt` for all successfully processed records.
- **Adaptive Exponential Backoff Polling**: Updated background sync polling in `src/components/app-shell.tsx` to handle sync errors with exponential backoff (10s base doubling up to 5 minutes max) rather than spinning in tight 10-second retry loops.

## v1.13.0 — Supabase Free Tier Retention & Storage Indicator (2026-08-06 05:45 PM)
- **Automatic 3-Day / 30-Day Data Retention**: Implemented `purgeOldSupabaseData()` in `sync-service.ts` to automatically delete old ephemeral logs from Supabase after every successful sync push. `audit_logs` are purged after 3 days (user logs requirement), while `financial_events`, `ledger_entries`, and `inventory_transactions` are purged after 30 days. Local SQLite database retains 100% of historical records.
- **Supabase Storage Indicator Widget**: Built `<StorageIndicator />` component on the main dashboard showing live Supabase disk usage (MB used vs 500MB free tier limit), visual health gauge (Healthy/Warning/Critical), per-table breakdown, and manual purge trigger.
- **Server Actions for Storage**: Added `getSupabaseStorageUsage()` and `triggerSupabaseDataPurge()` in `src/app/actions/admin.ts`.

## v1.12.6 — Comprehensive Sync Conflict Resolution (2026-08-06 05:40 PM)
- **Global Sync Resilience**: Conducted a comprehensive audit of all 17 synced models with unique constraints. Added proper push and pull conflict handling for all 11 previously unhandled models to eliminate cascading sync errors.
- **Push Crash Prevention**: Fixed a critical bug where direct-pushed models (`FinancialEvent`, `DayBook`, `Expense`, etc.) would crash the entire sync queue if a unique constraint was violated. Upserts now safely update existing records.
- **Merge Suffix Expansion**: Expanded the automatic duplicate resolution fallback (which appends `(Merge 1234)` to duplicate names) from just Parties and Vehicles to now include **Suppliers**, **Employees**, **Materials**, and **Weighbridge Tickets**. This guarantees the local SQLite database will never panic on naming collisions from the cloud.

## v1.12.5 — Invisible Delta Updates (2026-08-06 05:20 PM)
- **Silent Background Updates**: Reconfigured the updater pipeline to use `autoUpdater.quitAndInstall(true, true)` for completely invisible, zero-click updates similar to modern professional apps.
- **GitHub Release Sync**: Pre-created GitHub releases in the CI pipeline before building to fix 404 race conditions and missing `latest.yml` errors.

## v1.12.1 — Updater UI & Delta Patch Fixes (2026-08-06 01:14 PM)
- **Updater UI Minimize**: Added a "Minimize" button to the full-screen auto-updater overlay. Users can now minimize the 150MB download progress to a small floating widget in the top right, allowing them to continue using the ERP while the update downloads in the background.
- **Delta Patches (Blockmap) Fix**: Removed the conflicting `portable` Windows target from `package.json`, ensuring `electron-builder` correctly generates and uploads `.blockmap` files to GitHub. This enables the app to download tiny 2-5MB delta patches for future updates instead of redownloading the entire 150MB file.
- **Setup Wizard Restored**: Restored the visual blue NSIS Setup Wizard during installation so users can monitor exactly what the installer is doing.

## v1.12.0 — Phase 14 Sync Reliability (2026-08-06 12:45 PM)
- **Supabase Realtime Sync**: Configured the App Shell to listen to `schema-db-changes` via Supabase Realtime websocket channels. Changes committed on PC-A are now instantly pushed to PC-B and trigger a UI refresh without manual intervention.
- **Duplicate Entry Warning**: Added a duplicate pre-check for Book Number and Page Number collisions on Sales and Boulder purchases forms. Shows a confirmation warning prompt to the user before submitting to prevent accidental double-entry across multiple PCs.
- **Conflict Resolution**: Upgraded `sync-service.ts` to automatically resolve Book Number collisions from the cloud by honoring the record with the most recent `updatedAt` timestamp.

## v1.11.6 — Phase 13 Remediation (2026-08-06)
- **Input Validation**: Implemented Zod validation schemas (`SaleInputSchema`, `ExpenseInputSchema`, etc.) in `src/lib/validators/schemas.ts` and deployed them across all 5 primary Server Actions (`sales.ts`, `purchases.ts`, `expenses.ts`, `credits.ts`, `weighbridge.ts`).
- **UI Accessibility**: Added missing `aria-label`, `htmlFor`, and `id` bindings to 55+ form input, textarea, and checkbox controls across transaction and settings forms (KB-009).
- **Mobile Responsiveness**: Fixed element squishing on viewports <375px by enforcing mobile-first breakpoints (`grid-cols-1 sm:grid-cols-2`) and horizontal scroll flex wrappers in the bottom navigation (KB-010).
- **TypeScript Strictness**: Created `src/types/global.d.ts` to properly type `(window as any).electron`, removing `any` casts (KB-015). Validated the build with a clean `tsc --noEmit` pass.
- **Code Cleanliness**: Purged 267+ unused import and variable declarations across the 11 Server Action files via `eslint --fix` (KB-014).
- **DayBook Crash Guard**: Added nullish coalescing `data?.transfers ?? []` in `day-book-page.tsx` to handle cases where transfers array is undefined during initialization (KB-016).

## v1.11.5 — Comprehensive Codebase Audit & Defect Mapping (2026-08-05)
- **Multi-Agent Codebase Audit**: Executed a read-only codebase audit across 3 parallel categories (Type/Lint, Schema/DB/Server Actions, React/UI/Hydration). 0 source code files were modified. Identified 27 distinct findings (3 Critical, 8 High, 11 Medium, 5 Low).
- **Category 1 (Type / Lint Audit)**:
  - Identified **Dishonest Serialization Signature (`serialize<T>(value: T): T`)** across 11 Server Action files that claims to return `Date` objects while converting to ISO strings at runtime.
  - Mapped **18 Double Type Casts (`as unknown as T`)** in UI components hiding serialized schema mismatches.
  - Identified **Explicit `type Row = any` Aliases** in `employees-page.tsx`, `fuel-management-page.tsx`, `vehicle-expenses-page.tsx`.
  - Identified **267 ESLint `@typescript-eslint/no-unused-vars` errors** stemming from copy-pasted unused imports in Server Actions.
  - Mapped untyped `(window as any).electron` and `tx: any` transaction parameters.
- **Category 2 (Schema / DB / Server Actions Audit)**:
  - Identified **Critical Infinite Recursion Crash** in `src/app/actions/purchases.ts` (`runTx` calling itself recursively on `saveIncomingBoulder` / `deleteIncomingBoulder`).
  - Identified **Critical Missing SQLite Column `vehicles.engine_hours`** in `src/lib/bootstrap.ts` DDL causing runtime query crashes.
  - Discovered **Supabase Cloud Schema & Sync Desync** (`weighbridge_tickets`, `maintenance_records`, `maintenance_schedules`, `vehicle_stats` missing from `SYNC_MODEL_CONFIG` & `supabase_schema.sql`).
  - Mapped **Un-Transactional Multi-Step Mutations** in `sales.ts` and `purchases.ts` executing `upsertPartyByName` outside `$transaction`.
  - Identified **Complete Lack of Runtime Input Validation (Missing Zod Schemas)** across all Server Actions.
  - Found **Missing Delete PIN Checks** on `deleteIncomingBoulder`, `deletePartyCollection`, `deletePartyPayment`, and `resetSyncQueue`.
  - Identified **Orphaned DayBook Expense Entries** left behind on expense deletion.
- **Category 3 (React / UI / Hydration Audit)**:
  - Identified **Missing `suppressHydrationWarning` on `<html>`** in `src/app/layout.tsx` causing hydration warnings with `next-themes`.
  - Identified **Client Components Importing `@prisma/client`** directly without `import type` in `pending-tickets-table.tsx` and `weighbridge-forms.tsx`.
  - Mapped **Non-Deterministic `new Date()` Evaluation** in `useState` initializers (`tally-export-dashboard.tsx`).
  - Cataloged **55 Accessibility Gaps** (inputs missing `id`/`htmlFor` bindings and icon action buttons missing `aria-label`).
  - Identified **Mobile UI Grid Layout Squishing** on viewports <375px (`app-shell.tsx` `grid-cols-5`, `dashboard.tsx` `grid-cols-2`).
- **Documentation Updates**: Updated `docs/KNOWN_BUGS.md`, `docs/PROJECT_STATE.md`, and `docs/CHANGELOG.md` with full findings, root causes, and zero-regression fix recommendations.

## v1.11.5 Hotfix — 7-Agent Surgical Bug Fix (2026-08-05)
- **Runtime Crash Fix**: Fixed `runTx` infinite recursion stack overflow in `purchases.ts`.
- **Serialization Safety**: Replaced the dishonest `serialize<T>` function across 11 files with a single type-safe `Serialized<T>` generic utility to prevent disguised `Date` string bugs.
- **Transaction Safety**: Fixed sales and purchases upsert actions to use the `tx` client inside `$transaction` blocks instead of the global `prisma` client, preventing partial commits.
- **Authorization Verification**: Enforced `verifyEditPassword` checks when updating existing records in the sales and purchases upsert handlers.
- **Schema & SQLite Sync Fixes**: Added the missing `engine_hours` raw SQLite column and successfully synced `weighbridge_tickets`, `maintenance_records`, `maintenance_schedules`, and `vehicle_stats` into `SYNC_MODEL_CONFIG`.
- **UI Hydration Fixes**: Added `suppressHydrationWarning` to the root HTML layout, safely converted `new Date()` initializers to client-side mounts in the DayBook, and removed server-side Prisma binary imports from client components.
- **Hydration Crash Fix**: Fixed a silent `TypeError: Cannot read properties of null` crash on the Sales Entry Form material dropdown that caused the Server Components render error.

## v1.11.4 — Pull Sync & Hydration Fixes (2026-08-05)
- **Pull Sync ID Mapping**: Fixed a critical bug in `pullSync` where the `toCamelCase` function was empty, causing `prisma.material.upsert` to crash due to missing `materialName` arguments during pull operations.
- **Pull Sync Date Format**: Fixed `Invalid ISO-8601 DateTime` crash. Supabase drops the timezone 'Z' from timestamp columns, causing Prisma to reject them. Updated `toCamelCase` to automatically append 'Z' to incoming Supabase timestamps.
- **Pull Sync Unique Constraint**: Added a global intercept in `pullSync` for `P2002` (Unique Constraint) errors. If a remote pulled entity (like a vehicle or party) collides with a local unique name, it now gracefully appends `(Merge <id>)` and retries, mirroring the Push logic.
- **UI Hydration Mismatch**: Fixed a `Text content does not match server-rendered HTML` crash on the Sales Page caused by `new Date()` mismatching between server and client rendering by adding `suppressHydrationWarning`.
- **Security Settings**: Removed the hardcoded Master PIN override from the Security Settings page to strictly enforce Supabase Authentication.

## v1.11.3 — Zero-Regression Architecture & Emergency Startup Fixes (2026-08-05)
- **Startup Crash Fix**: Fixed Schema Desync where 3 Prisma fleet maintenance models (`MaintenanceRecord`, `MaintenanceSchedule`, `VehicleStats`) were missing from SQLite initialization in `bootstrap.ts`, causing fatal startup timeouts.
- **Sync Map Engine**: Replaced regex string transformation in `sync-service.ts` with build-time O(1) metadata schema generator (`generate-sync-map.js`) to guarantee exact 1:1 column mapping to Supabase.
- **Build Validation**: Added `validate-build.js` pre-package hook and runtime checks in Electron `main.js` to ensure critical assets (`preload.js`, `server.js`, `local.db`) are always present before boot.
- **Security Master Override**: Added offline Master PIN override (`master` / `mbm@admin2024`) for local POS Security Settings access without cloud auth dependencies.
- **Vercel Read-Only Fallback**: Updated `getGlobalSettings` to use `findUnique` read-only queries with graceful in-memory fallbacks to prevent Server Component 500 errors on read-only environments.
- **Vehicle Directory Cleanup**: Executed relational purge of vehicle directory table (`deleteMany`) while preserving foreign-key linked sales history (`onDelete: SetNull`).
- **Dark & Light Mode Polish**: Added WebKit `:-webkit-autofill` dark mode background overrides in `globals.css` and fixed `next-themes` SSR hydration mismatches in theme toggles.

## v1.11.2 — Auto-Updater Fixes & Sync Resilience (2026-08-05)
- **Auto-Updater**: Fixed race condition where update checks fired before the UI was loaded. Removed conflicting updater components. The UI now reliably prompts users to download updates.
- **Sync Fixes**: Replaced the publishable key with the correct JWT anon key in the environment to fix 401 Unauthorized errors.
- **Sync Resilience**: Added robust foreign-key dependency ordering to the sync engine (parents push before children), and added skip-and-retry logic for isolated FK violations to prevent blocking the queue.
- **User Interface**: Redesigned the DayBook "Current User" field to an elegant user badge.
- **User Logs**: Added a full User Logs / Audit Logs viewer page with date and entity filters.

## v1.11.0 — Major Feature Update (2026-08-04)
- **Phase 10 (Print/Export)**: Implemented Print & Export modules for reports and ledgers.
- **Phase 9 (Owner Dashboard)**: MBM Quarry Dashboard completed with live data integration.
- **Weighbridge Integration**: Added weighbridge feature with toggle (on/off) capabilities.
- **New Development Cycle**: Commenced a new set of phases (1-10) following the completion of the Auto-Updater UI.
- **Bug Fixes**: Fixed bugs across branches C, H, M, and L, and resolved `runTx` maximum call stack issues.
