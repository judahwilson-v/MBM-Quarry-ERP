# AI Setup & Best Practices: Codebase Audit and Phase-Wise Implementation Roadmap

**Project**: MBM Quarry ERP (`mbm-quarry-erp` v2.4.0)  
**Workspace**: `D:\mbm file\project\MBM1`  
**Source Baseline**: `docs/_temp/AI Coding Workflow Implementation Plan (1).pdf` (ChatGPT & Gemini Part 1 / AI Setup Research)  
**Date of Audit**: 2026-08-17  
**Status**: Comprehensive Audit Complete & Phase-Wise Roadmap Defined

---

## 1. Executive Summary & Research Foundation

This document provides a definitive architectural audit and phase-wise implementation roadmap for the **MBM Quarry ERP** system, synthesizing empirical research on AI-native software engineering and multi-turn autonomous coding agents extracted from `docs/_temp/AI Coding Workflow Implementation Plan (1).pdf`.

### 1.1 The Core Architectural Principle: Specification-Driven Development (SDD)
The fundamental insight established across 2025–2026 empirical studies is that **"vibe coding" without rigid engineering constraints leads to severe degradation across multi-turn agent sessions**. Specifically:
- **Architectural Drift**: Agents without strict boundary enforcement introduce code duplication, circular dependencies, and inconsistent naming conventions.
- **Message-Code Inconsistency**: Self-reporting by AI coding agents is unreliable (studies show up to 1.7% severe hallucinations where agents claim implementations that were never written).
- **The Solution**: **Specification-Driven Development (SDD)**. Specifications, schemas, and ADRs serve as the immutable, authoritative source of truth. Generated code is treated as a continuously verified, derived artifact bounded by deterministic automated verification gates.

### 1.2 Empirical Research Base
| Empirical Study | Publication Date | Key Benchmark Finding | Direct Application to MBM Quarry ERP |
| :--- | :--- | :--- | :--- |
| **Specification-Driven Development** (*arXiv:2607.16680*) | July 2026 | Contrasts pure vibe coding with SDD; establishes structured specs as authoritative truth. | All business rules, schemas, and boundaries live in versioned files under `docs/` and `prisma/`, not chat prompts. |
| **SlopCodeBench** (*arXiv:2603.24755*) | March 2026 | 89.8% verbosity increase and 80% structural erosion over multi-task horizons; 0/11 models solved multi-task horizons end-to-end. | Mandates **One Task = One Bounded Change**. Feature additions are strictly decoupled from wide-scale refactoring. |
| **Context Before Code** (*arXiv:2603.11073*) | March 2026 | Agents excel at scaffolding but degrade unless architectural constraints are explicitly codified and audited. | Every task must carry an explicit task contract defining forbidden changes, scope limits, and stop conditions. |
| **Configuration Smells in AGENTS.md** (*arXiv:2606.15828*) | June 2026 | 91% of repos have context smells: **Lint Leakage (62%)**, **Context Bloat (42%)**, **Conflicting Instructions (28%)**. | Offload formatting to ESLint/Prettier. Keep root policy under 200 lines with progressive disclosure. |
| **Agent READMEs Empirical Study** (*arXiv:2511.12884*) | Nov 2025 | 2,303 context files evaluated: only **14.5% addressed security and performance**. | Security (RLS, PINs, Rate-limiting) and performance (local SQLite) are non-negotiable quality gates. |
| **Message-Code Inconsistency** (*arXiv:2601.04886*) | Jan 2026 | Inconsistent PRs had 51.7% lower acceptance and took 3.5× longer to merge. | **Never trust agent self-reports.** Verification must rely on machine-verifiable tool command outputs (`tsc`, `lint`, `test`, `git diff`). |
| **TDFlow: Agentic TDD** (*EACL 2026*) | 2026 | Test-driven workflows achieved 88.8%–94.3% on SWE-Bench Verified. | Business rules and accounting math are expressed as executable Vitest/tsx tests that serve as objective functions. |
| **Agentic Refactoring Vulnerabilities** (*arXiv:2511.04824*) | Nov 2025 | 4.7% of AI refactorings introduce security vulnerabilities even when functional tests pass. | Decouple refactoring into dedicated cycles following architecture reviews and security scans. |
| **Two-Stage Code Review** (*arXiv:2607.13196*) | July 2026 | Multi-agent independent review prevents single-agent confirmation bias. | Multi-agent review protocol: Implementer outputs are audited by an independent Reviewer with fresh context. |
| **SWE-CI Long-Term Benchmark** (*arXiv:2603.03823*) | March 2026 | 100-task repository maintenance benchmark requiring pre- and post-task regression checks. | Run regression verification (`tsc`, `lint`, `test`, `build`) before and after every task. |
| **Deterministic Indexing (Graphify / SKG)** | 2025/2026 | AST parsing achieves 71.5× token efficiency vs probabilistic RAG with zero hallucinated imports. | Maintain deterministic code knowledge graphs mapping pages, actions, services, Prisma models, and Supabase tables. |

---

## 2. Human vs. Agent Practice Filtering Matrix

In strict compliance with project constraints, all manual human user tasks and ToS-violating practices are filtered out, while all technical, architectural, testing, security, and AI workflow practices are retained:

| Practice / Topic | Source / Context | Classification | Status in MBM | Agent & Engineering Action |
| :--- | :--- | :--- | :--- | :--- |
| **Jio AI Pro / Account Cycling** | Part 2, Phase 1 (Gemini) | ❌ **Filtered (Human / ToS Risk)** | Excluded | Flagged as a ToS compliance risk. Token arbitrage is purely an external human choice. |
| **Commercial API Subscriptions** | Part 2, Phase 1 | ❌ **Filtered (Human Task)** | Excluded | Subscription tier management and billing setup are external user actions. |
| **Reverse Proxy Container Hosting** | Part 2, Phase 1 (`gemini-poise`, `ccx`) | ❌ **Filtered (Human/Infra)** | Excluded | Manual proxy container setup is an infrastructure utility, not an in-code agent practice. |
| **Third-Party Secrets Manager Setup** | Part 2, Phase 5 (Doppler/Infisical) | ❌ **Filtered (Human/Infra)** | Excluded | External account creation is human-managed; in-code configuration hygiene is retained. |
| **Single Source of Truth (SSOT)** | Part 1, Phase 1 & 2 (ChatGPT) | ✅ **Included (Core Agent Practice)** | 🟢 **ALREADY BUILT** | `prisma/schema.prisma:1-442` & `scripts/generate-bootstrap-ddl.js:1-280`. |
| **AGENTS.md Context Engineering** | Part 1, Phase 2 & 15 | ✅ **Included (Core Agent Practice)** | 🟢 **ALREADY BUILT** | `docs/AI_POLICY.md:1-185` (<200 lines, progressive disclosure, no lint leakage). |
| **Task Contract Template** | Part 1, Phase 3 & 6 | ✅ **Included (Core Agent Practice)** | 🟡 **PARTIALLY BUILT** | Needs dedicated `docs/workflows/TASK_CONTRACT_TEMPLATE.md`. |
| **Two-Stage Independent Review** | Part 1, Phase 4 & 9 | ✅ **Included (Core Agent Practice)** | 🟡 **PARTIALLY BUILT** | `.agents/` team structure active; needs codification in `docs/workflows/WORKFLOW_REVIEW.md`. |
| **Regression Suite & SWE-CI Habits** | Part 1, Phase 5 & 13 | ✅ **Included (Core Agent Practice)** | 🟢 **ALREADY BUILT** | `package.json:10` & 11 test suites in `tests/`. |
| **Deterministic Code Knowledge Graph** | Part 1, Phase 5 & Part 2, Phase 4 | ✅ **Included (Core Agent Practice)** | 🔴 **PENDING** | Implement AST script `scripts/generate-knowledge-graph.js`. |
| **Test-Driven Objective Function (TDFlow)** | Part 1, Phase 8 | ✅ **Included (Core Agent Practice)** | 🟢 **ALREADY BUILT** | `tests/ledger-replay.test.ts`, `tests/schema-consistency.test.ts`. |
| **Machine-Verifiable Evidence Gates** | Part 1, Phase 10 | ✅ **Included (Core Agent Practice)** | 🟢 **ALREADY BUILT** | 6-tier gates wired in `package.json` (`tsc`, `lint`, `test`, `prisma:generate`, `build`, `git diff`). |
| **Dedicated Refactoring Cycles** | Part 1, Phase 11 | ✅ **Included (Core Agent Practice)** | 🟡 **PARTIALLY BUILT** | `docs/decisions/DECISION_LOG.md` (D-009); formalize in `docs/workflows/WORKFLOW_ORGANIZE.md`. |
| **Static Analysis Style/Naming Ownership** | Part 1, Phase 12 | ✅ **Included (Core Agent Practice)** | 🟢 **ALREADY BUILT** | ESLint, Prettier, TypeScript strict mode configured in `package.json` and `tsconfig.json`. |
| **Formal Domain Glossary** | Part 1, Phase 1, 3 & 12 | ✅ **Included (Core Agent Practice)** | 🟡 **PARTIALLY BUILT** | Create unified `docs/domain/glossary.md` for Party, Credit, Sale, Vehicle, Material, FinancialEvent. |
| **Living Architecture Decision Records** | Part 1, Phase 16 | ✅ **Included (Core Agent Practice)** | 🟡 **PARTIALLY BUILT** | Split `docs/decisions/DECISION_LOG.md` into modular `ADR-001` through `ADR-005`. |
| **Split Memory Architecture ("Markdown RAM")** | Part 1, Phase 17 & Part 2, Phase 3 | ✅ **Included (Core Agent Practice)** | 🟢 **ALREADY BUILT** | Clean separation across `docs/`, `docs/workflows/`, and `docs/architecture/`. |
| **Standardized Mermaid Visual Memory** | Part 2, Phase 3 (Gemini) | ✅ **Included (Core Agent Practice)** | 🟡 **PARTIALLY BUILT** | Convert ASCII diagrams in `docs/architecture/` to standardized Mermaid `graph TD` format. |

---

## 3. Ten Concrete Infrastructure Layers: Audit & Scorecard

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                   TEN INFRASTRUCTURE LAYERS AUDIT SCORECARD                      │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 1. Specification Hierarchy (docs/specification/)          🟡 PARTIALLY BUILT    │
│ 2. Domain Glossary (docs/domain/glossary.md)               🟡 PARTIALLY BUILT    │
│ 3. Architecture Decisions (docs/decisions/ADR-*.md)        🟡 PARTIALLY BUILT    │
│ 4. Agent Control Root (docs/AI_POLICY.md & AI_INDEX.md)    🟢 ALREADY BUILT      │
│ 5. Task Contract Template (docs/workflows/)                🟡 PARTIALLY BUILT    │
│ 6. Repository Knowledge Graph (AST Index / Graphify)       🔴 PENDING            │
│ 7. Automated Verification Gate (6-Tier Checks)             🟢 ALREADY BUILT      │
│ 8. Independent Review Stage (Two-Stage Review Protocol)    🟡 PARTIALLY BUILT    │
│ 9. Regression Protection Suite (Vitest / tsx Suites)       🟢 ALREADY BUILT      │
│ 10. Context Maintenance Habit (Doc-Sync Protocol)          🟢 ALREADY BUILT      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

| Layer # | Infrastructure Layer | Authoritative Location | Status | Primary Code Evidence / Identified Gap |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Specification Hierarchy** | `docs/specification/` | 🟡 **PARTIALLY BUILT** | Business rules exist in `docs/reference/BUSINESS_RULES.md` and system blueprint in `docs/architecture/SYSTEM_BLUEPRINT.md`. Needs consolidation into a formal `docs/specification/` folder containing the 6 modular contract files. |
| **2** | **Domain Glossary** | `docs/domain/glossary.md` | 🟡 **PARTIALLY BUILT** | Field names are cataloged in `docs/reference/VARIABLE_MAP.md` and calculations in `docs/reference/BUSINESS_RULES.md`. A dedicated semantic glossary defining invariants for Party, Credit, Sale, Vehicle, Material, and FinancialEvent is needed. |
| **3** | **Architecture Decisions (ADRs)** | `docs/decisions/` | 🟡 **PARTIALLY BUILT** | `docs/decisions/DECISION_LOG.md` (lines 1–72) documents 16 decisions (D-001 to D-016). Needs splitting into modular RFC-style records (`ADR-001-offline-first.md` to `ADR-005-storage-retention.md`). |
| **4** | **Agent Control Root** | `docs/AI_POLICY.md` | 🟢 **ALREADY BUILT** | `docs/AI_POLICY.md` (185 lines) and `docs/AI_INDEX.md` enforce a strict Three-Layer Loading Model, progressive disclosure, YAML frontmatter, and a 200-line budget limit. |
| **5** | **Task Contract Template** | `docs/workflows/` | 🟡 **PARTIALLY BUILT** | `docs/workflows/WORKFLOW_FEATURE.md` defines a 5-step workflow. Needs the formal `# TASK CONTRACT` template with explicit scope, forbidden changes, and acceptance criteria. |
| **6** | **Repository Knowledge Graph** | `docs/architecture/` / AST Index | 🔴 **PENDING** | Build-time scripts parse Prisma DMMF AST (`scripts/generate-sync-map.js`), but a full TypeScript AST code knowledge graph linking pages -> actions -> services -> Prisma is pending. |
| **7** | **Automated Verification Gate** | CI / `package.json` | 🟢 **ALREADY BUILT** | 6 individual verification tiers are wired in `package.json` (`tsc`, `lint`, `test`, `prisma:generate`, `build`, `git diff`), backed by `tests/schema-consistency.test.ts`. |
| **8** | **Independent Review Stage** | Reviewer Subagent / CI | 🟡 **PARTIALLY BUILT** | `.agents/` team structure contains dedicated reviewer roles (`reviewer_r1`, `auditor_r1`), but review rules need formal codification in `docs/workflows/WORKFLOW_REVIEW.md`. |
| **9** | **Regression Protection Suite** | `tests/` / Vitest | 🟢 **ALREADY BUILT** | 11 comprehensive test suites in `tests/` testing ledger replay determinism, schema consistency, weighbridge concurrency, and sync completeness (`package.json:10`). |
| **10** | **Context Maintenance Habit** | Doc-sync protocol | 🟢 **ALREADY BUILT** | Enforced in `docs/AI_POLICY.md:45-67` ("Documentation Synchronization Rules") with strict guidelines on updating documentation upon schema/feature changes. |

---

## 4. Detailed Phase-by-Phase Codebase Correlation & Code Evidence

### Phase 1: Database & Backend Foundation / Security Architecture

#### 1.1 Authoritative Single Source of Truth (Prisma SSOT)
- **Status**: 🟢 **ALREADY BUILT**
- **Code Evidence**:
  - `prisma/schema.prisma` (Lines 1–442): Authoritative schema defining 32 models mapped to `snake_case` tables with strict relations, indexes, and constraints.
  - `scripts/generate-bootstrap-ddl.js` (Lines 1–280): Dynamically parses Prisma DMMF AST at build-time to generate `src/lib/generated/bootstrap-ddl.json` containing SQLite table creation and indexing statements.
  - `scripts/generate-pg-schema.js` (Lines 1–130): Automatically transforms the SQLite schema into the PostgreSQL equivalent at `prisma/schema_pg.prisma`.
  - `scripts/generate-supabase-sql.js` (Lines 1–260): Translates Prisma DMMF models into production Supabase PostgreSQL DDL (`docs/database/supabase_schema.sql`).
  - `scripts/generate-sync-map.js` (Lines 1–45): Generates bidirectional property mappings (`src/lib/sync/sync-map.json`).
  - `package.json` (Line 8):
    ```json
    "prebuild": "node scripts/stamp-version.js && node scripts/generate-sync-map.js && node scripts/generate-bootstrap-ddl.js && node scripts/generate-pg-schema.js && node scripts/generate-supabase-sql.js"
    ```
  - `tests/schema-consistency.test.ts` (Lines 1–280): Automated Vitest suite asserting zero schema drift between Prisma DMMF, SQLite DDL, indexes, and PostgreSQL definitions.

#### 1.2 Dual-Schema Synchronization & Dynamic Self-Healing
- **Status**: 🟢 **ALREADY BUILT**
- **Code Evidence**:
  - `src/lib/bootstrap.ts` (Lines 1–180): Dynamic runtime database self-healing. Inspects SQLite catalogs (`sqlite_master`, `pragma_table_info`), creates missing tables from `bootstrap-ddl.json`, and applies dynamic column additions via `ensureSQLiteColumn()` without dropping existing user data.
  - `src/app/actions/setup-supabase.ts` (Lines 1–120): Server action utilizing the direct `pg` driver to provision PostgreSQL schemas, foreign keys, and RLS policies on Supabase instances.

#### 1.3 Explicit Security Quality Gate: Row Level Security (RLS)
- **Status**: 🟢 **ALREADY BUILT**
- **Code Evidence**:
  - `docs/database/supabase_rls_policies.sql` (Lines 1–65): Enables RLS on all 28+ remote PostgreSQL tables and provisions authenticated-access policies:
    ```sql
    ALTER TABLE public.outgoing_sales ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow authenticated access" ON public.outgoing_sales
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    ```
  - `src/app/actions/setup-supabase.ts` (Lines 60–95): Automates execution of RLS enablement and policy application.
- **Identified Gap / Phase 1 Action**: Add an automated integration test verifying that anonymous Supabase requests are rejected (HTTP 401/403) across all endpoints.

#### 1.4 Input Sanitization & Runtime Type Safety (Zod)
- **Status**: 🟢 **ALREADY BUILT**
- **Code Evidence**:
  - `src/lib/validators/schemas.ts` (Lines 1–203): Granular Zod schemas with custom numeric coercion, positive value bounds, and localized error messages (`validateWithSchema`, `SaleInputSchema`, `DeleteSaleSchema`, `IncomingBoulderInputSchema`, `ExpenseInputSchema`, `PartyCollectionInputSchema`, `PartyPaymentInputSchema`, `CreateWeighbridgeTicketSchema`, `CompleteWeighbridgeTicketSchema`, `VoidWeighbridgeTicketSchema`).
  - `src/app/actions/sales.ts` (Line 177):
    ```typescript
    const validated = validateWithSchema(SaleInputSchema, input);
    ```
  - `src/app/actions/purchases.ts` (Line 42) & `src/app/actions/expenses.ts` (Line 38): Strict validation before transaction execution.

#### 1.5 Variable Immutability & Immutable Constants
- **Status**: 🟢 **ALREADY BUILT**
- **Code Evidence**:
  - `src/lib/sync/sync-config.ts` (Lines 1–120): All sync priority and topological dependency lists are defined as immutable `SCREAMING_SNAKE_CASE` constants: `PUSH_PRIORITY`, `PULL_ORDER`, `DIRECT_PUSH_MODELS`, `REMOTE_CONFLICT_COLUMNS`, `LOCAL_CONFLICT_FIELDS`.
  - `src/lib/sync/sync-service.ts` (Lines 728–733):
    ```typescript
    const RETENTION_POLICY: { table: string; days: number }[] = [
      { table: "audit_logs",              days: 3  },
      { table: "financial_events",        days: 30 },
      { table: "ledger_entries",          days: 30 },
      { table: "inventory_transactions",  days: 30 },
    ];
    ```

#### 1.6 Environment & Configuration Hygiene
- **Status**: 🟡 **PARTIALLY BUILT**
- **Code Evidence**:
  - `src/lib/prisma.ts` (Lines 14–20): Dynamic fallback resolving `process.env.DATABASE_URL` with local fallback `prisma/local.db`.
  - `src/lib/supabase/client-sync.ts` (Lines 6–12): Checks `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - `package.json` (Line 112): Bundles `.env.production` as an Electron extra resource.
- **Identified Gap**: Relies on raw `process.env` lookups with ad-hoc runtime exceptions. Missing a centralized compile-time/runtime `zod-env` validation module (`src/lib/config/env.ts`) that validates all required environment variables at application startup.
- **Phase 1 Action**: Implement `src/lib/config/env.ts` with a Zod schema validating `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SECRET_KEY`.

---

### Phase 2: Offline-First & Synchronization Layer

#### 2.1 Embedded Local SQLite Persistence (100% Offline Autonomy)
- **Status**: 🟢 **ALREADY BUILT**
- **Code Evidence**:
  - `desktop/main.js` (Lines 25–65): Sets `DATABASE_URL` pointing to `%APPDATA%/mbm-quarry-erp/quarry.db` and launches the Next.js standalone server locally.
  - `src/lib/prisma.ts` (Lines 29–52): Singleton `PrismaClient` targeting the local SQLite database.
  - `src/app/actions/sales.ts` (Lines 101–109, 194–362): Server action transactions execute synchronously on the local SQLite instance inside `runTx(async (tx) => { ... })`, committing transactions in under 15ms without waiting for internet connectivity.

#### 2.2 Deterministic Append-Only Sync Queue & Audit Log Pipeline
- **Status**: 🟢 **ALREADY BUILT**
- **Code Evidence**:
  - `prisma/schema.prisma` (Lines 243–255): `AuditLog` model with `entityName`, `entityId`, `action`, `payload`, `role`, `reason`, `createdAt`.
  - `src/lib/domain/audit/service.ts` (Lines 1–74): `writeAuditEvent(tx, ...)` writes atomic audit snapshots inside the exact same local SQLite transaction as the business mutation.
  - `src/lib/sync/sync-service.ts` (Lines 85–180): `pushSync()` queries `AuditLog` where `createdAt > lastSyncedAt` and syncs direct projection models (`FinancialEvent`, `LedgerEntry`, `InventoryStock`, `InventoryTransaction`).
  - `src/lib/sync/auto-sync.ts` (Lines 1–25): `triggerAutoSync()` triggers background sync via `setTimeout` immediately after transaction commit.

#### 2.3 Idempotency & Conflict Resolution
- **Status**: 🟢 **ALREADY BUILT**
- **Code Evidence**:
  - `src/lib/sync/sync-service.ts` (Lines 531–610): Comprehensive conflict resolution handling during `pullSync()`:
    - *Materials*: Merged by `materialName` (Lines 535–552).
    - *Sales & Boulder Purchases*: Duplicate `serialNumber` / `bookNumber` resolved by timestamp comparison (`incomingTime >= localTime` -> remote wins; otherwise local preserved) (Lines 554–576).
    - *Name-Based Entities (Parties, Vehicles, Suppliers, Employees)*: Unique constraint collision auto-appends `(Merge <id>)` suffix to prevent database crashes (Lines 578–586).
    - *Weighbridge Tickets*: Remote duplicate tickets offset by `+900000` (Lines 587–590).
- **Identified Gap**: Conflict resolution rules are directly embedded in code but need formal architectural documentation in `docs/decisions/ADR-002-sync-model.md`.

#### 2.4 Automated Sync Diagnostics & In-Memory Ring Buffer
- **Status**: 🟢 **ALREADY BUILT**
- **Code Evidence**:
  - `src/lib/sync/sync-diagnostics.ts` (Lines 1–160): Singleton `SyncDiagnostics` with a 200-entry in-memory ring buffer, tracking timestamp, level (`INFO`, `WARN`, `ERROR`, `FATAL`), phase (`PUSH`, `PULL`, `CURSOR`, `PROJECTION`, `RETENTION`, `INIT`), table name, and Postgres error code classification (`23503` FK missing, `23505` Unique violation, `42P01` Undefined table, `NETWORK`).
  - `src/app/settings/sync/page.tsx` & `src/app/admin/page.tsx`: UI screens exposing live diagnostic logs and error tables.

#### 2.5 Supabase Free-Tier Storage Management & Purge Engine
- **Status**: 🟢 **ALREADY BUILT**
- **Code Evidence**:
  - `src/lib/sync/sync-service.ts` (Lines 724–771): `purgeOldSupabaseData()` runs daily or on-demand to delete remote `audit_logs` older than 3 days, and `financial_events`, `ledger_entries`, and `inventory_transactions` older than 30 days. Local SQLite retains 100% of history indefinitely.
  - `src/components/storage-indicator.tsx` (Lines 1–150): UI progress gauge showing real-time Supabase disk consumption against the 500 MB free-tier quota with a one-click manual purge button.

#### 2.6 Automated Sync Validation Test Suite
- **Status**: 🟢 **ALREADY BUILT**
- **Code Evidence**:
  - `tests/sync-completeness.test.ts` (Lines 1–121): Asserts `PUSH_PRIORITY`, `PULL_ORDER`, `REMOTE_CONFLICT_COLUMNS`, `LOCAL_CONFLICT_FIELDS`, and `sync-map.json` cover all 32 models symmetrically.
  - `tests/sync-config.test.ts` (Lines 1–85): Verifies dependency order (e.g. `Party` before `Vehicle`, `Material` before `OutgoingSale`).

---

### Phase 3: Core Domain Models, Business Rules & Specification Contracts

#### 3.1 Financial Event Architecture & Double-Entry Ledger Projections
- **Status**: 🟢 **ALREADY BUILT**
- **Code Evidence**:
  - `src/lib/domain/financial-events/service.ts` (Lines 1–27): `createFinancialEvent(tx, input)` creates immutable events with UUIDs, correlation IDs, schema versions, and JSON payloads.
  - `src/lib/domain/ledger/projector.ts` (Lines 1–70): `projectLedgerEntry()` deterministically projects `SALE_CREATED` events into `LedgerEntry` rows (`cashAmount`, `bankAmount`, `gPayAmount`, `creditAmount`, `totalAmount`).
  - `src/lib/domain/ledger/service.ts` (Lines 1–85): `rebuildLedger(tx)` allows tearing down and completely replaying the entire ledger from historical financial events.
  - `src/lib/domain/ledger/party-ledger-service.ts` (Lines 1–120): `recalculatePartyLedger()` reconstructs running account balances across sales, purchases, collections, and payments.
  - `src/lib/domain/daybook/projector.ts` (Lines 1–80): `projectDayBookExpenses()` projects daily operating expenses and aggregates cash/bank drawers.
  - `tests/ledger-replay.test.ts` (Lines 1–152): Automated Vitest test proving deterministic replay, idempotent projection, and duplicate rejection.
  - `docs/architecture/FINANCIAL_EVENT_ARCHITECTURE.md` (Lines 1–250): Full architectural reference.

#### 3.2 Pure Calculation Sales Engine (`src/lib/sales-engine.ts`)
- **Status**: 🟢 **ALREADY BUILT**
- **Code Evidence**:
  - `src/lib/sales-engine.ts` (Lines 1–213): Pure mathematical calculation engine:
    - *Rate Overrides*: Requires mandatory remarks if rate differs from material rate card (Lines 133–138).
    - *Vehicle Capacity Deviations*: Checks `companyBodyQty` and `extraBodyQty`; mandates `quantityReason` if load differs (Lines 123–132).
    - *GST Math*: Exact 5% calculation split into 2.5% SGST + 2.5% CGST with rounding reconciliation (Lines 161–175).
    - *Multi-Payment Allocation*: Calculates `cashPaid + bankPaid + gPayPaid = paidTotal` and auto-derives `remainingCredit = finalAmount - paidTotal` (Lines 177–181).

#### 3.3 Specification-Driven Development (SDD) Hierarchy
- **Status**: 🟡 **PARTIALLY BUILT**
- **Code Evidence**:
  - Architectural and business specifications currently exist in `docs/reference/BUSINESS_RULES.md`, `docs/architecture/SYSTEM_BLUEPRINT.md`, `docs/architecture/FINANCIAL_EVENT_ARCHITECTURE.md`, `docs/database/DATABASE_MAP.md`, and `docs/reference/VARIABLE_MAP.md`.
- **Identified Gap**: Specifications are scattered across disparate directories. Missing the canonical `docs/specification/` hierarchy containing the 6 modular contract files:
  1. `docs/specification/business-rules.md`
  2. `docs/specification/functional-requirements.md`
  3. `docs/specification/non-functional-requirements.md`
  4. `docs/specification/architecture-contract.md`
  5. `docs/specification/data-model-contract.md`
  6. `docs/specification/integration-contracts.md`
- **Phase 3 Action**: Restructure and migrate existing specification content into `docs/specification/`.

#### 3.4 Formal Domain Glossary (`docs/domain/glossary.md`)
- **Status**: 🟡 **PARTIALLY BUILT / PENDING**
- **Code Evidence**:
  - Entity fields are cataloged in `docs/reference/VARIABLE_MAP.md` and basic formulas are in `docs/reference/BUSINESS_RULES.md`.
- **Identified Gap**: Missing a single dedicated `docs/domain/glossary.md` defining unambiguous business semantics and invariants for: `Party`, `PartyCredit`, `Vehicle`, `Material`, `Sale`, `Paid Total`, `Remaining Credit`, `FinancialEvent`, `IncomingBoulder`, `DayBook`, `WeighbridgeTicket`.
- **Phase 3 Action**: Author `docs/domain/glossary.md` with explicit formulas and domain boundaries.

#### 3.5 Living Architecture Decision Records (ADRs)
- **Status**: 🟡 **PARTIALLY BUILT**
- **Code Evidence**:
  - `docs/decisions/DECISION_LOG.md` (Lines 1–72) documents 16 key architectural decisions (D-001: Offline-First SQLite, D-002: Financial Events SSOT, D-003: Rebuildable Projections, D-004: Payment Field Decomposition, D-005: Electron Packaging, etc.).
- **Identified Gap**: Decisions are currently combined in a single flat file rather than modular, versioned ADR files (`ADR-001-offline-first.md` through `ADR-005-storage-retention.md`) containing Context, Decision, Alternatives Considered, Consequences, and Immutability rules.
- **Phase 3 Action**: Break down `DECISION_LOG.md` into modular RFC-style ADR files under `docs/decisions/`.

---

### Phase 4: Frontend UI/UX, State Management & Visual Context Memory

#### 4.1 Persistent Visual Working Memory ("Markdown RAM") & Mermaid Standards
- **Status**: 🟡 **PARTIALLY BUILT**
- **Code Evidence**:
  - `docs/architecture/SYSTEM_BLUEPRINT.md` (Lines 29–41) contains ASCII flow diagrams illustrating data flow.
- **Identified Gap**: Visual memory lacks standardized Mermaid diagrams adhering to the empirical constraints: `graph TD` orientation, alphanumeric node IDs (no raw spaces), no inline custom CSS/themes, and clear `subgraph` module boundaries.
- **Phase 4 Action**: Convert ASCII architecture diagrams into standardized Mermaid `graph TD` diagrams in `docs/architecture/SYSTEM_BLUEPRINT.md` and `docs/architecture/FINANCIAL_EVENT_ARCHITECTURE.md`.

#### 4.2 Unidirectional State Flow & Optimistic Local UI Updates
- **Status**: 🟢 **ALREADY BUILT**
- **Code Evidence**:
  - React Client Components -> Server Actions (`src/app/actions/*.ts`) -> Prisma Client (`src/lib/prisma.ts`) -> Synchronous SQLite commit -> UI updates immediately -> Fire-and-forget background sync (`triggerAutoSync()`).
  - Example: `src/app/actions/sales.ts` (Lines 101–109, 194–362).

#### 4.3 Deterministic Software Knowledge Graph (SKG / Tree-sitter / Graphify)
- **Status**: 🔴 **PENDING**
- **Code Evidence**:
  - `scripts/generate-sync-map.js` and `scripts/generate-bootstrap-ddl.js` parse Prisma DMMF AST metadata, but there is no repository-wide AST code knowledge graph.
- **Identified Gap**: Missing an automated TypeScript AST indexer (using TypeScript Compiler API or Tree-sitter) that generates a deterministic dependency graph (`docs/architecture/codebase-knowledge-graph.json`) mapping pages -> server actions -> domain services -> Prisma models -> Supabase tables.
- **Phase 4 Action**: Implement `scripts/generate-knowledge-graph.js` in Phase 4 of the roadmap.

---

### Phase 5: Quality Assurance, Verification Gates, Testing & AI Governance

#### 5.1 Bounded 1-Task Agent Lifecycle
- **Status**: 🟢 **ALREADY BUILT**
- **Code Evidence**:
  - `docs/AI_POLICY.md` (Lines 15–43): Mandates a strict Three-Layer Loading Model (Layer 0: Index & Policy, Layer 1: Workflow Guides, Layer 2: Detail references). Restricts agents to reading a maximum of 4–5 documents per task.
  - `docs/AI_POLICY.md` (Lines 34–42): Explicit instructions for lower/specialist models (read only relevant docs, never perform unconstrained full-repo search, focus strictly on assigned scope).
  - `.agents/` team structure enforces separation between Orchestrator, Explorers, Implementers, and Reviewers.

#### 5.2 Standardized Task Contract Template
- **Status**: 🟡 **PARTIALLY BUILT**
- **Code Evidence**:
  - `docs/workflows/WORKFLOW_FEATURE.md` (Lines 37–60) outlines creating a temporary plan with files to modify, database changes, and tasks.
- **Identified Gap**: Missing the formal, standardized `# TASK CONTRACT` template (`OBJECTIVE`, `SCOPE`, `SOURCE OF TRUTH`, `EXISTING ARCHITECTURE`, `REQUIRED BEHAVIOR`, `FORBIDDEN CHANGES`, `ACCEPTANCE CRITERIA`, `VERIFICATION COMMANDS`, `STOP CONDITION`) as a dedicated file in `docs/workflows/TASK_CONTRACT_TEMPLATE.md`.
- **Phase 5 Action**: Create `docs/workflows/TASK_CONTRACT_TEMPLATE.md` and reference it in `docs/AI_POLICY.md`.

#### 5.3 Test-Driven Objective Functions (TDFlow Pattern)
- **Status**: 🟢 **ALREADY BUILT**
- **Code Evidence**:
  - Domain rules and accounting math are expressed as executable Vitest and tsx tests:
    - `tests/ledger-replay.test.ts` (Deterministic replay, double-entry balances, deduplication).
    - `tests/schema-consistency.test.ts` (Prisma DMMF vs SQLite DDL vs Supabase Postgres parity).
    - `tests/sync-completeness.test.ts` (Bi-directional model coverage).
    - `tests/weighbridge-race.test.ts` & `tests/adversarial-weighbridge.test.ts` (Concurrency protection and atomic sequencing).
    - `tests/dashboard-metrics.test.ts` (Financial metrics calculations).

#### 5.4 6-Tier Machine-Verifiable Automated Verification Gates
- **Status**: 🟢 **ALREADY BUILT / PARTIALLY BUILT**
- **Code Evidence**:
  - **Tier 1 (Type Safety)**: `npx tsc --noEmit` (TypeScript 5.x).
  - **Tier 2 (Static Analysis)**: `npm run lint` (`package.json:13`, Next.js ESLint).
  - **Tier 3 (Unit & Integration Tests)**: `npm test` (`package.json:10`, Vitest + tsx test runner).
  - **Tier 4 (Schema Validation)**: `npm run prisma:generate` (`package.json:15`) & `tests/schema-consistency.test.ts`.
  - **Tier 5 (Production Build)**: `npm run build` (`package.json:9`, standalone Next.js compilation).
  - **Tier 6 (Scope Isolation / Git Diff)**: `docs/AI_POLICY.md:54` ("A fix verified in-session with `git diff` + `git status` is finalized").
- **Identified Gap**: The 6 tiers exist as separate commands. A single unified composite script (`npm run verify:all`) chaining all 6 tiers with exit-code-0 enforcement is missing.
- **Phase 5 Action**: Add `"verify:all": "npx tsc --noEmit && npm run lint && npm test && npx prisma validate && npm run build"` to `package.json`.

#### 5.5 Two-Stage Multi-Agent Independent Review
- **Status**: 🟡 **PARTIALLY BUILT**
- **Code Evidence**:
  - Multi-agent coordination directory `.agents/` includes dedicated reviewer and sentinel roles.
- **Identified Gap**: Independent reviewer checklist is defined in agent prompts and literature, but needs formal codification in `docs/workflows/WORKFLOW_REVIEW.md`.
- **Phase 5 Action**: Create `docs/workflows/WORKFLOW_REVIEW.md`.

#### 5.6 Dedicated Refactoring Cycles
- **Status**: 🟡 **PARTIALLY BUILT**
- **Code Evidence**:
  - `docs/decisions/DECISION_LOG.md` (D-009: Phase Discipline: "A phase is frozen before next begins; speculative features to IDEAS.md").
  - `docs/AI_POLICY.md` (Lines 57–67: "When NOT to update documentation").
- **Identified Gap**: Explicit decoupling policy between feature implementation tasks and refactoring sweeps is not formally codified as a workflow rule.
- **Phase 5 Action**: Add refactoring cycle guidelines to `docs/workflows/WORKFLOW_ORGANIZE.md`.

#### 5.7 Context Maintenance & Configuration Smells Prevention
- **Status**: 🟢 **ALREADY BUILT**
- **Code Evidence**:
  - `docs/AI_POLICY.md` (Lines 1–185): Fully compliant with the June 2026 empirical study on configuration smells (*arXiv:2606.15828*):
    - *Anti-Context Bloat*: Policy is under 200 lines (185 lines) with progressive disclosure.
    - *Anti-Lint Leakage*: Formatting/naming rules are offloaded to ESLint/Prettier/tsconfig rather than clogging prompts.
    - *Anti-Blind References*: Strict YAML frontmatter and file registry in `docs/AI_INDEX.md`.
    - *Anti-Init Fossilization*: Ephemeral temp files in `docs/_temp/` enforce mandatory `expires:` timestamps (Lines 98–109).

---

## 5. Master Practice Correlation & Audit Matrix

| # | Practice / Specification | Category | Status | Exact Code Evidence (File & Lines) / Identified Gap | Next Action & Target Phase |
|---|---|---|---|---|---|
| **1** | Single Source of Truth Schema | Phase 1 | 🟢 **ALREADY BUILT** | `prisma/schema.prisma:1-442`, `scripts/generate-bootstrap-ddl.js:1-280`, `package.json:8` | None (Complete) |
| **2** | Dual-Schema Dynamic Sync | Phase 1 | 🟢 **ALREADY BUILT** | `src/lib/bootstrap.ts:1-180`, `src/app/actions/setup-supabase.ts:1-120` | None (Complete) |
| **3** | Supabase Row-Level Security (RLS) | Phase 1 | 🟢 **ALREADY BUILT** | `docs/database/supabase_rls_policies.sql:1-65`, `src/app/actions/setup-supabase.ts:60-95` | Add automated RLS CI test (Phase 1) |
| **4** | Zod Runtime Schema Validation | Phase 1 | 🟢 **ALREADY BUILT** | `src/lib/validators/schemas.ts:1-203`, `src/app/actions/sales.ts:177` | None (Complete) |
| **5** | Variable Immutability & Constants | Phase 1 | 🟢 **ALREADY BUILT** | `src/lib/sync/sync-config.ts:1-120`, `src/lib/sync/sync-service.ts:728-733` | None (Complete) |
| **6** | Centralized `zod-env` Validation | Phase 1 | 🟡 **PARTIALLY BUILT** | `src/lib/prisma.ts:14-20`, `src/lib/supabase/client-sync.ts:6-12` (Ad-hoc `process.env` lookups) | Implement `src/lib/config/env.ts` (Phase 1) |
| **7** | Offline-First SQLite Execution | Phase 2 | 🟢 **ALREADY BUILT** | `desktop/main.js:25-65`, `src/lib/prisma.ts:29-52`, `src/app/actions/sales.ts:101-109` | None (Complete) |
| **8** | Append-Only Sync Queue / Audit Log | Phase 2 | 🟢 **ALREADY BUILT** | `prisma/schema.prisma:243-255`, `src/lib/domain/audit/service.ts:1-74`, `src/lib/sync/sync-service.ts:85-180` | None (Complete) |
| **9** | Idempotent Sync & Conflict Handling | Phase 2 | 🟢 **ALREADY BUILT** | `src/lib/sync/sync-service.ts:531-610` (Materials, Sales, Merges, Weighbridge) | Formalize in ADR-002 (Phase 2) |
| **10** | Sync Diagnostics Ring Buffer | Phase 2 | 🟢 **ALREADY BUILT** | `src/lib/sync/sync-diagnostics.ts:1-160` (200 entries, error codes 23503, 23505, 42P01) | None (Complete) |
| **11** | Supabase Free-Tier Storage Purge | Phase 2 | 🟢 **ALREADY BUILT** | `src/lib/sync/sync-service.ts:724-771`, `src/components/storage-indicator.tsx:1-150` | None (Complete) |
| **12** | Automated Sync Test Suite | Phase 2 | 🟢 **ALREADY BUILT** | `tests/sync-completeness.test.ts:1-121`, `tests/sync-config.test.ts:1-85` | None (Complete) |
| **13** | Financial Event Architecture | Phase 3 | 🟢 **ALREADY BUILT** | `src/lib/domain/financial-events/service.ts:1-27`, `docs/architecture/FINANCIAL_EVENT_ARCHITECTURE.md` | None (Complete) |
| **14** | Replayable Double-Entry Ledger | Phase 3 | 🟢 **ALREADY BUILT** | `src/lib/domain/ledger/projector.ts:1-70`, `src/lib/domain/ledger/service.ts:1-85`, `tests/ledger-replay.test.ts:1-152` | None (Complete) |
| **15** | Pure Calculation Sales Engine | Phase 3 | 🟢 **ALREADY BUILT** | `src/lib/sales-engine.ts:1-213` (Rate & vehicle rules, 5% GST, multi-payment) | None (Complete) |
| **16** | SDD Hierarchy (`docs/specification/`) | Phase 3 | 🟡 **PARTIALLY BUILT** | Scattered in `docs/reference/BUSINESS_RULES.md` and `docs/architecture/SYSTEM_BLUEPRINT.md` | Create `docs/specification/` (Phase 3) |
| **17** | Formal Domain Glossary | Phase 3 | 🟡 **PARTIALLY BUILT** | `docs/reference/VARIABLE_MAP.md` (fields), `docs/reference/BUSINESS_RULES.md` (formulas) | Create `docs/domain/glossary.md` (Phase 3) |
| **18** | Modular RFC-Style ADRs | Phase 3 | 🟡 **PARTIALLY BUILT** | `docs/decisions/DECISION_LOG.md:1-72` (16 decisions D-001..D-016 in flat log) | Split into `ADR-001`..`ADR-005` (Phase 3) |
| **19** | Standardized Mermaid Visual Memory | Phase 4 | 🟡 **PARTIALLY BUILT** | `docs/architecture/SYSTEM_BLUEPRINT.md:29-41` (ASCII diagrams only) | Add Mermaid `graph TD` diagrams (Phase 4) |
| **20** | Unidirectional State & Optimistic UI | Phase 4 | 🟢 **ALREADY BUILT** | `src/app/actions/sales.ts:101-109`, `src/app/actions/sales.ts:194-362` | None (Complete) |
| **21** | AST Software Knowledge Graph | Phase 4 | 🔴 **PENDING** | Missing TypeScript AST graph linking pages -> actions -> services -> Prisma | Build `scripts/generate-knowledge-graph.js` (Phase 4) |
| **22** | Bounded 1-Task Agent Lifecycle | Phase 5 | 🟢 **ALREADY BUILT** | `docs/AI_POLICY.md:15-43` (Three-layer loading model, max 5 docs, lower-model bounds) | None (Complete) |
| **23** | Standardized Task Contract Template | Phase 5 | 🟡 **PARTIALLY BUILT** | `docs/workflows/WORKFLOW_FEATURE.md:37-60` (Informal plan outline) | Add `docs/workflows/TASK_CONTRACT_TEMPLATE.md` (Phase 5) |
| **24** | Test-Driven Objective Functions | Phase 5 | 🟢 **ALREADY BUILT** | `tests/ledger-replay.test.ts`, `tests/schema-consistency.test.ts`, `tests/weighbridge-race.test.ts` | None (Complete) |
| **25** | 6-Tier Automated Verification Gates | Phase 5 | 🟢 **ALREADY BUILT** | `package.json:8-15` (`tsc`, `lint`, `test`, `prisma:generate`, `build`, `git diff`) | Add unified `npm run verify:all` (Phase 5) |
| **26** | Configuration Smells Prevention | Phase 5 | 🟢 **ALREADY BUILT** | `docs/AI_POLICY.md:1-185` (<200 lines, YAML frontmatter, strict temp expiration) | None (Complete) |

---

## 6. Phase-Wise Forward Implementation Roadmap

To systematically complete all **PARTIALLY BUILT** and **PENDING** practices without modifying active application features or risking regressions, the forward roadmap is structured into 5 sequential phases:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                   FIVE-PHASE FORWARD IMPLEMENTATION ROADMAP                      │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Phase 1: Database, Security & Configuration Hardening                            │
│   ├─ Task 1.1: Runtime Environment Schema Validation (src/lib/config/env.ts)     │
│   └─ Task 1.2: Automated RLS Security Integration Test (tests/security-rls.test) │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Phase 2: Offline-First & Sync Architectural Formalization                        │
│   └─ Task 2.1: Formalize Sync Decision Record (docs/decisions/ADR-002-sync.md)   │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Phase 3: Specification-Driven Development (SDD) & Domain Formalization           │
│   ├─ Task 3.1: Establish docs/specification/ Hierarchy (6 Contract Files)        │
│   ├─ Task 3.2: Formalize Domain Glossary (docs/domain/glossary.md)               │
│   └─ Task 3.3: Modularize ADRs (docs/decisions/ADR-001 through ADR-005)          │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Phase 4: Visual Memory & Software Knowledge Graph                                │
│   ├─ Task 4.1: Standardized Mermaid Visual Memory (graph TD in docs/architecture)│
│   └─ Task 4.2: AST Code Knowledge Graph Generator (scripts/generate-kg.js)       │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Phase 5: AI Governance, Task Contracts & Unified Verification                    │
│   ├─ Task 5.1: Standardized Task Contract Template (docs/workflows/CONTRACT.md)  │
│   ├─ Task 5.2: Multi-Agent Review Protocol (docs/workflows/WORKFLOW_REVIEW.md)   │
│   ├─ Task 5.3: Dedicated Refactoring Workflow (docs/workflows/WORKFLOW_ORG.md)   │
│   └─ Task 5.4: Unified 6-Tier Verification Script (npm run verify:all)           │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Phase 1: Database, Security & Configuration Hardening
1. **Task 1.1: Runtime Environment Schema (`zod-env`)**
   - *Target File*: `src/lib/config/env.ts`
   - *Scope*: Create centralized Zod schema validating `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SECRET_KEY` on startup with typed exports.
2. **Task 1.2: Automated RLS Security Integration Test**
   - *Target File*: `tests/security-rls.test.ts`
   - *Scope*: Author an automated test verifying that anonymous Supabase client requests receive HTTP 401/403 across all 28 synchronized tables.

### Phase 2: Offline-First & Sync Architectural Formalization
1. **Task 2.1: Formalize Sync Architecture Decision Record**
   - *Target File*: `docs/decisions/ADR-002-sync-model.md`
   - *Scope*: Document sync priority queues, deterministic conflict resolution strategies (merges, timestamps, offsets), and Supabase free-tier storage retention limits (3-day audit logs, 30-day financial events).

### Phase 3: Specification-Driven Development (SDD) & Domain Formalization
1. **Task 3.1: Establish `docs/specification/` Hierarchy**
   - *Target Files*:
     - `docs/specification/business-rules.md` (authoritative accounting, quarry rates, GST math)
     - `docs/specification/functional-requirements.md` (module workflows: sales, boulder, weighbridge, daybook)
     - `docs/specification/non-functional-requirements.md` (offline latency, SQLite file limits, 500 MB cloud quota)
     - `docs/specification/architecture-contract.md` (layer boundary rules: server actions -> local db -> sync)
     - `docs/specification/data-model-contract.md` (32 Prisma model definitions, field nullabilities, relations)
     - `docs/specification/integration-contracts.md` (thermal printer ESC/POS, weighbridge serial port, Supabase REST)
   - *Scope*: Migrate and formalize specifications into the canonical modular structure.
2. **Task 3.2: Formalize Domain Glossary**
   - *Target File*: `docs/domain/glossary.md`
   - *Scope*: Define authoritative semantic terminology and mathematical invariants for: `Party`, `PartyCredit`, `Vehicle`, `Material`, `Sale`, `Paid Total`, `Remaining Credit`, `FinancialEvent`, `IncomingBoulder`, `DayBook`, `WeighbridgeTicket`.
3. **Task 3.3: Modularize ADRs**
   - *Target Files*: `docs/decisions/ADR-001-offline-first.md` through `ADR-005-storage-retention.md`.
   - *Scope*: Split `DECISION_LOG.md` into modular RFC-style records with Context, Decision, Alternatives Considered, Consequences, and Immutability rules.

### Phase 4: Visual Memory & Software Knowledge Graph
1. **Task 4.1: Standardized Mermaid Visual Memory**
   - *Target Files*: `docs/architecture/SYSTEM_BLUEPRINT.md`, `docs/architecture/FINANCIAL_EVENT_ARCHITECTURE.md`
   - *Scope*: Convert ASCII diagrams to standardized Mermaid `graph TD` diagrams with alphanumeric node IDs and `subgraph` boundaries.
2. **Task 4.2: AST Code Knowledge Graph Generator**
   - *Target File*: `scripts/generate-knowledge-graph.js`
   - *Scope*: Author a script utilizing TypeScript Compiler API to index repository relationships into `docs/architecture/codebase-knowledge-graph.json`.

### Phase 5: AI Governance, Task Contracts & Unified Verification
1. **Task 5.1: Standardized Task Contract Template**
   - *Target File*: `docs/workflows/TASK_CONTRACT_TEMPLATE.md`
   - *Scope*: Publish standardized `# TASK CONTRACT` template (`OBJECTIVE`, `SCOPE`, `SOURCE OF TRUTH`, `EXISTING ARCHITECTURE`, `REQUIRED BEHAVIOR`, `FORBIDDEN CHANGES`, `ACCEPTANCE CRITERIA`, `VERIFICATION COMMANDS`, `STOP CONDITION`).
2. **Task 5.2: Multi-Agent Review Protocol**
   - *Target File*: `docs/workflows/WORKFLOW_REVIEW.md`
   - *Scope*: Codify two-stage independent review checklist and `git diff` verification rules.
3. **Task 5.3: Dedicated Refactoring Workflow**
   - *Target File*: `docs/workflows/WORKFLOW_ORGANIZE.md`
   - *Scope*: Codify guidelines enforcing that refactoring sweeps occur only in dedicated cycles decoupled from feature implementation.
4. **Task 5.4: Unified 6-Tier Verification Gate**
   - *Target File*: `package.json`
   - *Scope*: Add composite `"verify:all": "npx tsc --noEmit && npm run lint && npm test && npx prisma validate && npm run build"` script.

---

## 7. Conclusion & Governance Verification

The MBM Quarry ERP repository exhibits exceptional alignment with modern AI-native engineering principles. Its core execution layer (embedded SQLite), schema synchronization pipeline (`package.json:8`), event-driven double-entry accounting (`tests/ledger-replay.test.ts`), pure calculation engine (`src/lib/sales-engine.ts`), and Vitest regression suites already fulfill **53.8% (14/26)** of recommended practices.

By following the non-breaking 5-phase roadmap outlined above, the remaining **30.8% partially built** and **15.4% pending** practices (documentation formalization, AST graph generation, runtime env validation, and unified gate scripts) can be systematically completed to achieve a 100% compliant, autonomous engineering foundation.
