# AI Documentation & Memory Policy

## Objective

The documentation is part of the codebase. Its purpose is to reduce future repository exploration and token usage by acting as persistent architectural memory. Documentation should remain synchronized with the current implementation.

---

## AI Workflow

Before searching the repository:
1. Always start by reading `docs/AI_INDEX.md`. This is the central index.
2. Follow the links in `AI_INDEX.md` to read the documentation relevant to the requested task.
3. Determine whether the existing documentation is sufficient.
4. Search the codebase only for the specific implementation details required.
5. Never perform a full repository search unless explicitly requested.

The documentation exists to reduce unnecessary code traversal.

---

## Documentation Synchronization Rules

After completing any task:
1. Determine which documents are affected.
2. Update only affected documents.
3. Leave unrelated documents unchanged.
4. Never rewrite documents unnecessarily.
5. Never duplicate information.
6. Prefer references over repeated explanations.
7. A fix verified in-session with actual command output (git diff + git status) is finalized and is not re-audited in a future session unless the file changes again.

## When NOT to Update Documentation

Do NOT update documentation for:
- formatting changes
- comments
- refactoring with identical behavior
- CSS styling
- typo fixes
- test-only changes

Only update documentation when architecture, business logic, database, API, workflow, or developer behavior changes.

---

## Documentation Ownership

Each document has a single responsibility.

- **`docs/AI_INDEX.md`**
  - **The core AI entry point.** Links to everything else.
- **`docs/architecture/SYSTEM_BLUEPRINT.md`**
  - Overall architecture, module relationships, and high-level data flow.
- **`docs/database/DATABASE_MAP.md`**
  - Prisma, SQLite, Supabase, migrations, and sync relationships.
- **`docs/reference/VARIABLE_MAP.md`**
  - Important application variables, cross-layer mappings, and canonical field names.
- **`docs/reference/MODULE_INDEX.md`**
  - Module ownership, entry points, and dependencies.
- **`docs/reference/SOURCE_OF_TRUTH.md`**
  - Canonical locations, ownership rules, and duplicate prevention.
- **`docs/decisions/DECISION_LOG.md`**
  - Architectural decisions, design rationale, and trade-offs.
- **`docs/handoff/AI_HANDOFF.md`**
  - Current project state, active work, known issues, and next recommended tasks.
- **`docs/CHANGELOG.md`**
  - User-visible and architectural changes.

---

## Folder Structure

All documentation must strictly conform to the following directory structure:

```text
docs/
├── AI_INDEX.md          # Central AI Memory Index (Start Here)
├── architecture/      # High-level architecture, flow, design patterns
├── database/          # DB maps, schemas, Supabase/SQLite sync info
├── reference/         # Variables, indexes, lists, guides, APIs
├── handoff/           # Active/next tasks, project state trackers
├── decisions/         # Architecture Decision Records (ADRs)
├── audit/             # Code audit reports
│   ├── current/       # Latest audit reports
│   └── archive/       # Old audit snapshots
├── archive/           # Deprecated docs, old plans, obsolete handoffs
└── _temp/             # Disposable AI working files & incident reports
```

**Rule**: AI must not create new top-level Markdown files freely. Any new document must either fit into an existing category or require justification as to why a new permanent category/document is strictly needed. **Incident reports must never be left in the root directory.**

---

## Search Policy

- Documentation first.
- Repository second.
- Never perform a full repository crawl unless:
  - Explicitly requested.
  - Documentation is outdated.
  - Documentation cannot answer the question.

---

## Documentation Quality Rules

- Documentation must describe the current implementation.
- Do not speculate.
- Do not duplicate information.
- Prefer references over repeated explanations.
- Every document should have one clear purpose.

---

## Source of Truth Rule

Code remains the ultimate source of truth. Documentation is synchronized memory.
If documentation conflicts with code:
- Trust the code.
- Update the documentation.
- Never modify code to match outdated documentation.

---

## Token Optimization

- Always minimize repository traversal.
- Prefer documentation over repository search whenever possible.
- Only inspect files that are required for the requested task.
- Avoid re-reading files whose information already exists in maintained documentation.

---

## Temporary Working Files & Incident Reports

Temporary analysis files, debugging logs, and incident reports must **never** be stored with permanent documentation or in the project root. Use `docs/_temp/` (e.g., `docs/_temp/incident_report_X.md`, `docs/_temp/audit/`, `docs/_temp/debug/`).
These files are disposable. Permanent documentation must never depend on temporary files.
After the task is completed:
- Archive useful findings into permanent documentation or `docs/archive/`.
- Delete obsolete temporary files.
- Keep the project root and `docs/` root perfectly clean.
