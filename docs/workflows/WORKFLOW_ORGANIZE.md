---
type: workflow
id: SET-4
name: Full Reorganization
last_updated: "2026-08-16"
triggers:
  - organize
  - cleanup
  - full audit
  - token burn
  - labour mode
  - file reorganize
---

# WORKFLOW: Full Reorganization (SET 4)

> **When to use**: Token-burning, labour-oriented full file organization mode. Rare but thorough.

---

## Step 1 — Audit Current State

### Temp File Cleanup
1. List all files in `docs/_temp/`
2. Check each file's `expires:` header in YAML frontmatter
3. Delete any expired temp files
4. Archive any temp files that contain useful findings → `docs/archive/`

### Root Directory Cleanliness
1. List all files in project root
2. Flag any `.md` or `.txt` files that don't belong (should be in `docs/`)
3. Move or delete them

### Archive Rotation
1. List all files in `docs/archive/`
2. Delete anything older than 90 days that has no ongoing relevance
3. Keep archived files that are referenced by other docs

---

## Step 2 — Documentation Freshness Check

For each file in the `docs/` tree, verify:

| File | Check |
|:---|:---|
| `AI_INDEX.md` | Does the file registry match actual files on disk? |
| `AI_HANDOFF.md` | Does the version match `package.json`? |
| `CHANGELOG.md` | Is the latest version entry present? |
| `DATABASE_MAP.md` | Does it match `prisma/schema.prisma`? |
| `VARIABLE_MAP.md` | Are all canonical field names current? |
| `MODULE_INDEX.md` | Does it match actual `src/` directory structure? |
| `KNOWN_BUGS.md` | Are "active" bugs actually still active? |
| `BUSINESS_RULES.md` | Do rules match current implementation? |
| `ENGINEERING_RULES.md` | Are rules still accurate? |

---

## Step 3 — Code Hygiene Sweep

```bash
npm run lint              # Check for lint errors
npx tsc --noEmit          # Check for type errors
npm test                  # Run test suite
```

If any fail → document findings, do NOT fix (unless explicitly asked to enter WORKFLOW_DEBUG).

---

## Step 4 — Structural Audit

1. Check for orphaned files (files not imported by anything)
2. Check for empty directories
3. Check for duplicate code across modules
4. Verify all `src/app/` routes have corresponding entries in `MODULE_INDEX.md`

---

## Step 5 — Update Docs

After cleanup:
- [ ] Update `AI_INDEX.md` file registry if files were added/removed
- [ ] Update `KNOWN_BUGS.md` if bugs were resolved during cleanup
- [ ] Update `CHANGELOG.md` if the cleanup is significant enough to note
- [ ] Log the reorganization date in `AI_HANDOFF.md`

---

## Labour Mode Protocol

When executing many small tasks (e.g., 100 lint fixes):

1. **Phase first**: Group tasks by file or module
2. **One at a time**: Fix one file completely before moving to the next
3. **Verify after each phase**: Run `npx tsc --noEmit` after each group
4. **Progress tracking**: Use a temp file to track completion:

```yaml
---
type: temp
task: "Organize: <scope>"
created: "<now>"
expires: "<+24h>"
parent_workflow: organize
---

## Progress
- [x] Phase 1: sales.ts cleanup (5/5 tasks)
- [/] Phase 2: purchases.ts cleanup (2/7 tasks)
- [ ] Phase 3: credits.ts cleanup (0/3 tasks)
```
