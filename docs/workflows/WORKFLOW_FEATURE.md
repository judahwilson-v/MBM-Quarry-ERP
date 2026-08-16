---
type: workflow
id: SET-2
name: Feature Addition
last_updated: "2026-08-16"
triggers:
  - add feature
  - new feature
  - implement
  - idea
  - enhancement
---

# WORKFLOW: Feature Addition (SET 2)

> **When to use**: Adding new functionality. Idea → Plan → Build → Trace → Verify.

---

## Step 1 — Understand the Idea

**Read Order:**
1. `docs/AI_INDEX.md` → orient yourself
2. `docs/reference/MODULE_INDEX.md` → find where this feature belongs
3. `docs/architecture/SYSTEM_BLUEPRINT.md` → understand the architecture layer
4. `docs/reference/BUSINESS_RULES.md` → check for domain constraints
5. `docs/reference/IDEAS.md` → check if this idea was previously discussed

**Clarify with user:**
- What exactly should the feature do?
- Which module does it affect?
- Does it touch the database? → If yes, read `DATABASE_MAP.md` + `VARIABLE_MAP.md`
- Does it touch sync? → If yes, read `SYSTEM_BLUEPRINT.md` § Database Change Protocol

---

## Step 2 — Create Implementation Plan

Write a plan to `docs/_temp/feature_<name>.md`:

```yaml
---
type: temp
task: "Feature: <short description>"
created: "<now>"
expires: "<+72h>"
parent_workflow: feature
---
```

**Plan must include:**
- Files to create (with paths)
- Files to modify (with exact changes)
- Database changes (if any) — remember the **3-source-of-truth** rule:
  1. `prisma/schema.prisma`
  2. `src/lib/bootstrap.ts`
  3. Supabase migration SQL
- Tasks broken into smallest possible units
- Dependency order between tasks

---

## Step 3 — Build (Labour Mode)

- Execute tasks one at a time
- After each task: `npx tsc --noEmit`
- After all tasks: `npm run lint`, `npm test`, `npm run build`

---

## Step 4 — Consequence Trace (What Could Break)

> [!WARNING]
> New features can break existing features. Trace ALL impacts.

Check:
1. Did I add a new database column? → Is it nullable or does it have a default? (breaking change if not)
2. Did I change any existing API signature? → Find all callers
3. Did I add new imports? → Verify they resolve
4. Does the feature interact with sync? → Verify `sync-config.ts` topological order
5. Does the feature need dark mode support? → Add `dark:` Tailwind variants

---

## Step 5 — Update Documentation

- [ ] New DB field → `DATABASE_MAP.md`, `VARIABLE_MAP.md`
- [ ] New module/route → `MODULE_INDEX.md`
- [ ] New business rule → `BUSINESS_RULES.md`
- [ ] New architectural decision → `DECISION_LOG.md`
- [ ] Feature complete → `CHANGELOG.md`, `AI_HANDOFF.md`
- [ ] New idea captured → `IDEAS.md`

**Then delete** the temp file from Step 2.
