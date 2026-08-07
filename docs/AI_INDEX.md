# AI_INDEX.md (Persistent Memory Index)

> [!IMPORTANT]
> **AI INSTRUCTION:** This is your primary entry point. Start here to navigate the project.

## Priority Order
To minimize token usage and hallucination risk, you MUST search for information in this exact order:
1. `AI_INDEX.md` (this file)
2. Relevant linked document(s) from the lists below
3. Repository search (only for specific implementation details)
4. Full repository crawl (only if explicitly requested by the user)

---

## Permanent Memory
These files represent the permanent architectural memory of the project.

### 1. Project State & Active Tasks
Check these files to understand what is currently being worked on and the project's roadmap.
* **[AI_HANDOFF.md](handoff/AI_HANDOFF.md)**: Current project state, active work, known issues, and next recommended tasks.
* **[ROADMAP.md](handoff/ROADMAP.md)**: Upcoming milestones.
* **[AI_PROGRESS.md](../AI_PROGRESS.md)**: The active long-running task continuation checkpoint (if it exists).
* **[PHASE_A_SYNC_AND_ERP_PROGRESS.md](handoff/PHASE_A_SYNC_AND_ERP_PROGRESS.md)**: Sync progress for Phase A.

### 2. Architecture & Systems
Read these to understand how the system is built.
* **[SYSTEM_BLUEPRINT.md](architecture/SYSTEM_BLUEPRINT.md)**: Overall architecture, module relationships, and high-level data flow.
* **[FINANCIAL_EVENT_ARCHITECTURE.md](architecture/FINANCIAL_EVENT_ARCHITECTURE.md)**: Financial event sourcing reference.
* **[DECISION_LOG.md](decisions/DECISION_LOG.md)**: Architectural decisions, design rationale, and trade-offs (ADRs).

### 3. Database & Sync
Read these for anything touching Prisma, SQLite, or Supabase.
* **[DATABASE_MAP.md](database/DATABASE_MAP.md)**: Prisma, SQLite, Supabase, migrations, and sync relationships.

### 4. Reference & Rules
Use these for lookups, variables, and canonical standards.
* **[SOURCE_OF_TRUTH.md](reference/SOURCE_OF_TRUTH.md)**: Canonical locations, ownership rules, and duplicate prevention.
* **[VARIABLE_MAP.md](reference/VARIABLE_MAP.md)**: Important application variables, cross-layer mappings, and canonical field names.
* **[MODULE_INDEX.md](reference/MODULE_INDEX.md)**: Module ownership, entry points, and dependencies.
* **[KNOWN_BUGS.md](reference/KNOWN_BUGS.md)**: Active bugs, workarounds, and resolved post-mortems.
* **[ENGINEERING_RULES.md](reference/ENGINEERING_RULES.md)**: Engineering standards.
* **[BUSINESS_RULES.md](reference/BUSINESS_RULES.md)**: Business domain logic and constraints.
* **[MAINTAINERS.md](reference/MAINTAINERS.md)**: Maintainer information.

### 5. Audit & Maintenance
* **[MASTER_CODEBASE_AUDIT_REPORT.md](audit/current/MASTER_CODEBASE_AUDIT_REPORT.md)**: The latest comprehensive audit of the codebase.
* **[CHANGELOG.md](CHANGELOG.md)**: User-visible and architectural changes.

---

## Temporary Memory
> [!WARNING]
> **Strict AI Rule**: If you generate an incident report, debugging log, or scratchpad, **DO NOT** place it in the project root.

* **`docs/_temp/`**: Put all active incident reports here while working.
* **`docs/archive/`**: Move resolved incident reports or obsolete documentation here, or delete them when finished.
