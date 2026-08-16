---
schema_version: 2
project: "MBM Quarry ERP"
project_version: "2.3.0"
stack: "Next.js 14 + Prisma/SQLite + Electron + Supabase"
last_updated: "2026-08-16 20:30:00"
total_docs: 20
---

# AI_INDEX.md — Project Memory Entry Point

> [!IMPORTANT]
> **START HERE.** Read this file first. Then read ONLY the files relevant to your task.
> Do NOT crawl the repository. Do NOT read all docs. Follow the links below.

## Quick Context

**MBM Quarry ERP** is an offline-first desktop ERP for quarry management.
- **Stack**: Next.js 14 (App Router) + Prisma + SQLite + Electron + Supabase (cloud sync)
- **Version**: v2.3.0 (Stable, field-tested)
- **State**: All systems operational. See `handoff/AI_HANDOFF.md` for current status.
- **Database**: 3 sources of truth — `prisma/schema.prisma`, `src/lib/bootstrap.ts`, Supabase SQL.

---

## 🔀 Workflows — What Are You Doing?

Pick the workflow that matches your current task. Each guide tells you exactly which docs to read and in what order.

| SET | Workflow | When to Use | Guide |
|:----|:---------|:------------|:------|
| 1 | **Debug** | Bug found, error, something broke | [WORKFLOW_DEBUG.md](workflows/WORKFLOW_DEBUG.md) |
| 2 | **Feature** | Adding new functionality | [WORKFLOW_FEATURE.md](workflows/WORKFLOW_FEATURE.md) |
| 3 | **Release** | Shipping an app update | [WORKFLOW_RELEASE.md](workflows/WORKFLOW_RELEASE.md) |
| 4 | **Organize** | Full cleanup / audit / reorganization | [WORKFLOW_ORGANIZE.md](workflows/WORKFLOW_ORGANIZE.md) |

---

## 📋 File Registry

Every documentation file in the project, its purpose, and when to read it.

### Layer 0 — Always Read
| File | Purpose |
|:-----|:--------|
| `AI_INDEX.md` (this file) | Entry point, navigation, file registry |
| `AI_POLICY.md` | Rules for AI behavior, doc updates, temp files |

### Layer 1 — Read Based on Task
| File | Purpose | Read When |
|:-----|:--------|:----------|
| [AI_HANDOFF.md](handoff/AI_HANDOFF.md) | Current project version, status, blockers | Starting any task |
| [SYSTEM_BLUEPRINT.md](architecture/SYSTEM_BLUEPRINT.md) | Architecture, folder structure, runtime stack | Touching architecture |
| [MODULE_INDEX.md](reference/MODULE_INDEX.md) | Which module owns which files | Finding code locations |
| [VARIABLE_MAP.md](reference/VARIABLE_MAP.md) | Canonical field names (camelCase ↔ snake_case) | Creating/renaming fields |
| [KNOWN_BUGS.md](reference/KNOWN_BUGS.md) | Active bugs and resolved postmortems | Debugging |

### Layer 2 — Read When Specifically Needed
| File | Purpose | Read When |
|:-----|:--------|:----------|
| [DATABASE_MAP.md](database/DATABASE_MAP.md) | Full schema, all tables, migration strategy | Any database change |
| [FINANCIAL_EVENT_ARCHITECTURE.md](architecture/FINANCIAL_EVENT_ARCHITECTURE.md) | Event sourcing, immutable facts, projections | Touching financial logic |
| [BUSINESS_RULES.md](reference/BUSINESS_RULES.md) | Quarry domain rules (CFT, GST, credit) | Business logic changes |
| [ENGINEERING_RULES.md](reference/ENGINEERING_RULES.md) | Code standards, patterns, conventions | Writing new code |
| [DECISION_LOG.md](decisions/DECISION_LOG.md) | Past architectural decisions (ADRs) | Questioning "why was it done this way?" |
| [CHANGELOG.md](CHANGELOG.md) | Version history, what changed when | Updating release notes |
| [MAINTAINERS.md](reference/MAINTAINERS.md) | Who owns what, contact info | Coordination |
| [IDEAS.md](reference/IDEAS.md) | Unconfirmed feature ideas | Feature planning |
| [DEPLOYMENT.md](reference/DEPLOYMENT.md) | Packaging, release, update workflow | Shipping a release |
| [AUTO_UPDATE.md](reference/AUTO_UPDATE.md) | Electron auto-updater setup | Auto-update changes |
| [RELEASE.md](reference/RELEASE.md) | Release process checklist | Shipping a release |
| [RELEASE_NOTES.md](reference/RELEASE_NOTES.md) | User-facing release notes | Shipping a release |
| [OWNER_DASHBOARD_PRD.md](reference/OWNER_DASHBOARD_PRD.md) | Owner dashboard product requirements | Dashboard work |
| [QUARRY_FIELD_NOTES.md](reference/QUARRY_FIELD_NOTES.md) | Real-world quarry observations | Understanding domain |
| [AI_PROGRESS_TEMPLATE.md](handoff/AI_PROGRESS_TEMPLATE.md) | Template for long-running task checkpoints | Multi-session tasks |

### Audit
| File | Purpose |
|:-----|:--------|
| [MASTER_CODEBASE_AUDIT_REPORT.md](audit/current/MASTER_CODEBASE_AUDIT_REPORT.md) | Latest comprehensive codebase audit |

---

## 📐 Rules (Quick Reference)

### Search Priority
1. This file (AI_INDEX.md)
2. Relevant linked docs from the registry above
3. Repository search (for specific implementation details only)
4. Full repository crawl (ONLY if explicitly requested by user)

### Three-Layer Loading
- **Lower-capability models**: Read ONLY Layer 0 + Layer 1 files relevant to your task
- **Higher-capability models**: May additionally read Layer 2 files as needed
- **Never read all docs**. Budget: max 3-4 files per task.

### Temp Files
- All temp files go in `docs/_temp/`
- **NEVER** put temp files in the project root
- Every temp file MUST have YAML frontmatter with `created:` and `expires:` timestamps
- Delete expired temp files on sight

### Doc Updates
- Only update docs when architecture, business logic, database, API, or workflow actually changes
- Do NOT update docs for: formatting, comments, refactoring, CSS, typo fixes
- See `AI_POLICY.md` for full rules

### Database Changes — MANDATORY PROTOCOL
Every DB change MUST update ALL of:
1. `prisma/schema.prisma`
2. `src/lib/bootstrap.ts` (raw SQLite DDL)
3. Supabase migration SQL
4. `prisma/seed.ts` (if needed)
5. Sync engine (`src/lib/sync/`) if table is synced
