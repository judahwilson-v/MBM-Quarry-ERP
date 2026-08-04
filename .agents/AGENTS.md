# Agent Guidelines and Rules

## AI Operating Rules

Always:
- Read `README.md` and `AI_PROGRESS.md` first.
- Read relevant documentation in `docs/` before writing code.
- **Search existing code before creating new files or components** — reuse instead of re-inventing.
- Never duplicate existing documentation or components.
- Follow existing architecture and keep changes minimal.
- Explain major changes or architectural deviations before implementation.

---

## Output Style & Communication

- **Be concise**: Keep responses direct and focused.
- **No obvious explanations**: Do not explain trivial or self-explanatory code blocks.
- **Targeted edits**: Prefer minimal patches and targeted edits over full file rewrites.
- **No invented APIs**: Verify method signatures and imports against actual definitions before calling.
- **Clarify ambiguity**: Ask questions when requirements are underspecified or ambiguous.

---

## Supabase Schema Changes
ALWAYS REMEMBER: Any change to the Supabase database schema or any new queries that need to be run against Supabase must be explicitly communicated to the user.
- DO NOT assume Supabase migrations will happen automatically.
- YOU MUST put a clear **WARNING SIGN** (e.g., using GitHub alerts like `> [!WARNING]` or bold warnings) in your response telling the user exactly what new query or SQL needs to be run in their Supabase dashboard.

---

## MBM Quarry - Safe Development Protocol (MANDATORY)

Before writing any code, follow this protocol. Database consistency is CRITICAL. A mistake can break production.

### Phase 1 - Analysis & Pre-Flight
1. Understand the feature and read relevant `docs/`.
2. Search for existing implementation across the codebase — reuse instead of rewrite.
3. Identify every affected file and database table.
4. Explain the implementation plan and keep changes minimal. Do NOT modify code yet.

### Phase 2 - Database Impact
If the feature changes the database in ANY way, you MUST update ALL of the following:
✅ Prisma schema changes (`prisma/schema.prisma`)
✅ SQLite raw initialization (`src/lib/prisma.ts`)
✅ Prisma migrations (if applicable)
✅ Supabase SQL migration
✅ Seed updates (`prisma/seed.ts`)
✅ Sync engine updates (`src/lib/sync/`)
✅ TypeScript type updates
✅ API changes
✅ Dashboard/report updates
✅ Existing queries & calculations
Never update only one.

### Phase 3 - Implementation
Implement the feature safely. Preserve backwards compatibility whenever possible.

### Phase 4 - Validation
After implementation verify: `npm run build`, `npm run lint`, `tsc --noEmit` run successfully.

### Phase 5 - Runtime Testing
Launch the application. Test every affected page. Create realistic dummy data. Verify Create, Read, Update, Delete. Verify calculations, reports, dashboard totals, and persistence on restart.

### Phase 6 - Production Safety
Verify that existing databases and fresh installations continue working. Ensure no schema mismatch exists and no runtime SQL errors occur.

### Phase 7 - Supabase
If database structure changes, generate the required Supabase SQL migration. Provide the exact SQL script and explain where it should be executed. Never assume it already exists.

### Phase 8 - Final Checklist
Before finishing confirm:
☑ Prisma schema updated
☑ SQLite initialization updated
☑ Supabase SQL generated
☑ Sync engine verified
☑ Types updated
☑ Build passes, Lint passes, TypeScript passes
☑ Runtime tested (Fresh & Existing database)
If any item cannot be verified, clearly state it. Never mark the task complete without verification.

---

## Mandatory Documentation Updates
**CRITICAL**: Every time you complete a task, solve a problem, or make significant code changes, you MUST update the corresponding documentation files in the `docs/` folder to reflect your changes. This includes:
- Updating `docs/CHANGELOG.md` with new features or fixes.
- Updating `docs/KNOWN_BUGS.md` when a bug is resolved or discovered.
- Updating `docs/PROJECT_STATE.md` if the project phase or blocking issues change.
- Updating any specific feature documentation (e.g., `docs/BUSINESS_RULES.md` or `docs/ARCHITECTURE.md`) if your changes alter the existing rules or architecture.
**CRITICAL PLACEMENT RULE**: Do NOT create new or unwanted `.md` files in random directories (such as the project root). You must ONLY update existing documentation files. If a new documentation file is strictly required, it MUST be created directly inside the `docs/` folder.
DO NOT skip documentation updates. A problem is not considered solved until the respective `.md` files are updated.

