---
schema_version: 2
type: policy
last_updated: "2026-08-18 16:00:00"
---

# AI Documentation & Memory Policy

## Objective

Documentation acts as persistent architectural memory to reduce token usage and hallucination risk. It must stay synchronized with the current implementation.

---

## AI Workflow

Before searching the repository:
1. Always start by reading `docs/AI_INDEX.md`. This is the central index.
2. Pick the **workflow guide** matching your task (Debug, Feature, Release, Organize, Review).
3. Follow the workflow's read order to load only relevant docs.
4. Search the codebase only for specific implementation details required.
5. Never perform a full repository search unless explicitly requested.
6. For implementation tasks, use the **Task Contract Template** (`docs/workflows/TASK_CONTRACT_TEMPLATE.md`) to structure your work scope.
7. After completing work, request **Independent Review** (`docs/workflows/WORKFLOW_REVIEW.md`) to verify changes.

### Three-Layer Loading Model

| Layer | What | Budget |
|:------|:-----|:-------|
| **0** | `AI_INDEX.md` + `AI_POLICY.md` | Always read |
| **1** | Workflow guides + context files (HANDOFF, MODULE_INDEX, etc.) | 1-2 files per task |
| **2** | Detail references (DATABASE_MAP, FINANCIAL_EVENT_ARCHITECTURE) | Only when specifically needed |

**Rule**: No task should require reading more than 4-5 docs total.

### Lower-Model Instructions

If you are a smaller/faster model being used for code fixes:
- Read ONLY `AI_INDEX.md` + the ONE workflow file relevant to your task
- Do NOT attempt to read all docs
- Do NOT rewrite docs — only append or edit specific lines
- Do NOT reorganize file structures
- Focus exclusively on the code change requested

---

## Documentation Synchronization Rules

After completing any task:
1. Determine which documents are affected.
2. Update only affected documents.
3. Leave unrelated documents unchanged.
4. Never rewrite documents unnecessarily.
5. Never duplicate information across files.
6. Prefer references (links) over repeated explanations.
7. A fix verified in-session with `git diff` + `git status` is finalized and is not re-audited unless the file changes again.

### When NOT to Update Documentation

Do NOT update documentation for:
- Formatting changes
- Comments
- Refactoring with identical behavior
- CSS styling
- Typo fixes
- Test-only changes

Only update documentation when architecture, business logic, database, API, workflow, or developer behavior changes.

---

## Documentation Ownership

Each document has a single responsibility. See `AI_INDEX.md` § File Registry for the complete list.

**Key ownership rules:**
- `AI_INDEX.md` → Central entry point and file registry
- `AI_HANDOFF.md` → Current project state (version, status, blockers)
- `CHANGELOG.md` → Version history
- `DATABASE_MAP.md` → Schema and migration strategy
- `VARIABLE_MAP.md` → Canonical field names
- `MODULE_INDEX.md` → Module ownership and entry points
- `DECISION_LOG.md` → Architectural decisions
- `KNOWN_BUGS.md` → Active bugs and resolved postmortems

---

## YAML Frontmatter Standard

**Every documentation file MUST include YAML frontmatter** for machine-parseable metadata:

### Permanent docs:
```yaml
---
type: reference | architecture | policy | handoff | decision
last_updated: "YYYY-MM-DD HH:MM:SS" # Include Date AND Time (since docs are updated multiple times a day)
---
```

### Temp/working files:
```yaml
---
type: temp
task: "Brief description of what this file is for"
created: "YYYY-MM-DDTHH:MM:SSZ"
expires: "YYYY-MM-DDTHH:MM:SSZ"
parent_workflow: "debug | feature | release | organize"
---
```

**Rule**: Any AI session that encounters a temp file past its `expires:` date MUST delete it immediately.

---

## Folder Structure

```text
docs/
├── AI_INDEX.md              # Layer 0: Entry point (Start Here)
├── AI_POLICY.md             # Layer 0: This file (AI behavior rules)
├── CHANGELOG.md             # Version history
├── workflows/               # Layer 1: Task-specific workflow guides
│   ├── WORKFLOW_DEBUG.md    #   SET 1: Debug & root cause
│   ├── WORKFLOW_FEATURE.md  #   SET 2: Feature addition
│   ├── WORKFLOW_RELEASE.md  #   SET 3: Release & deploy
│   └── WORKFLOW_ORGANIZE.md #   SET 4: Full reorganization
├── architecture/            # Layer 2: System design
├── database/                # Layer 2: Schema, SQL, migrations
├── reference/               # Layer 2: Lookups, rules, variables
├── handoff/                 # Active state tracking
├── decisions/               # Architecture Decision Records
├── audit/                   # Code audit reports
│   ├── current/             # Latest audits
│   └── archive/             # Old audit snapshots
├── archive/                 # Deprecated/obsolete docs
└── _temp/                   # Disposable AI working files
```

**Rules:**
- AI must not create new top-level Markdown files outside this structure.
- New documents must fit into an existing category or require explicit justification.
- Incident reports and temp files must NEVER be placed in the project root.

---

## Search Policy

1. Documentation first.
2. Repository second.
3. Never perform a full repository crawl unless:
   - Explicitly requested by the user.
   - Documentation is outdated.
   - Documentation cannot answer the question.

---

## Source of Truth Rule

Code is the ultimate source of truth. Documentation is synchronized memory.

If documentation conflicts with code:
- Trust the code.
- Update the documentation.
- Never modify code to match outdated documentation.

---

## Token Optimization

- Always minimize repository traversal.
- Prefer documentation over repository search whenever possible.
- Only inspect files required for the current task.
- Avoid re-reading files whose information already exists in maintained documentation.
- Budget: Layer 0 + 1-2 Layer 1 files + 0-2 Layer 2 files = max 5 files per task.

---

## Temporary Working Files & Incident Reports

- Temporary files go in `docs/_temp/` — NEVER in the project root or `docs/` root.
- Every temp file MUST have YAML frontmatter with `created:` and `expires:` timestamps.
- Permanent documentation must never depend on temporary files.
- After task completion:
  - Archive useful findings into permanent docs or `docs/archive/`.
  - Delete obsolete temporary files.
  - Keep the project root and `docs/` root clean.
