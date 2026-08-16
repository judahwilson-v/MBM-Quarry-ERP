---
type: workflow
id: SET-1
name: Debug & Root Cause Analysis
last_updated: "2026-08-16"
triggers:
  - bug report
  - error message
  - something broke
  - debugging
  - root cause
---

# WORKFLOW: Debug & Root Cause Analysis (SET 1)

> **When to use**: Something is broken. You need to find why, fix it, trace consequences, and update docs.

---

## Step 1 — Root Cause Analysis Only (NO FIXES)

**Read Order:**
1. `docs/reference/KNOWN_BUGS.md` → check if this bug is already documented
2. `docs/reference/MODULE_INDEX.md` → identify which module owns the broken code
3. The specific source file(s) mentioned in the error

**Output**: A diagnosis. Write findings to `docs/_temp/debug_<issue>.md` with expiry header:
```yaml
---
type: temp
task: "Debug: <short description>"
created: "<now>"
expires: "<+48h>"
parent_workflow: debug
---
```

**Rules:**
- Do NOT fix anything yet
- Do NOT rewrite any docs
- Identify the exact file, line, and root cause
- Note all files that import/reference the broken code

---

## Step 2 — Plan the Fix

**Create a fix plan inside the temp file from Step 1:**
- List every file that needs to change
- For each file, describe the exact change
- Break into the SMALLEST possible individual tasks (1 file = 1 task ideally)
- Order tasks by dependency (fix the dependency first)

---

## Step 3 — Execute Fixes (Labour Mode)

- Work through tasks ONE AT A TIME
- After each fix: run `npx tsc --noEmit` to verify no new type errors
- After all fixes: run `npm run lint` and `npm test`

---

## Step 4 — Consequence Trace

> [!CAUTION]
> **This is the step most AI agents skip. Do NOT skip it.**

For every change you made, answer:
1. What other files import or reference the thing I changed?
2. Could my change break any of those references? (renamed export, changed return type, removed field)
3. Did I change any database field? → Check `DATABASE_MAP.md` and `VARIABLE_MAP.md`
4. Did I change any business rule? → Check `BUSINESS_RULES.md`

---

## Step 5 — Update Documentation

Only update docs if your fix changed:
- [ ] A database field/table → update `DATABASE_MAP.md`, `VARIABLE_MAP.md`
- [ ] An architectural pattern → update `SYSTEM_BLUEPRINT.md`
- [ ] A business rule → update `BUSINESS_RULES.md`
- [ ] A known bug status → update `KNOWN_BUGS.md` (move to RESOLVED section)
- [ ] The project version → update `AI_HANDOFF.md`, `CHANGELOG.md`

**Then delete** the temp file from Step 1.
