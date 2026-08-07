# AI Continuation Checkpoint — Template v1.0

> **Instructions**: Copy this file to `AI_PROGRESS.md` in the project root when starting a new long-running task.
> Fill in each section. Delete this instruction block.

> **Protocol**: Before stopping for any reason (token limit, interruption, or completion), update `AI_PROGRESS.md`.
> The next AI must be able to continue without reading previous chat history.

---

## CURRENT STATE

```
Current Task:    [Task ID — Short description]
Status:          [About X%]
Next File:       [path/to/next/file]
Next Command:    [exact command to run]
Blockers:        [None / describe blockers]
```

---

## 1. Context

```
Project:         [Project name]
Version:         [Current version]
Phase:           [Current phase]
Current Goal:    [One-line goal]
Branch:          [Git branch]
State:           [Committed / Uncommitted / description]
```

---

## 2. Resume Instructions

```
1. Read this file first.
2. Run: git status --short
3. Preserve all existing changes.
4. Continue from the first unchecked □ task in "Remaining Work".
5. Update this file after every completed milestone.
6. Never redo completed work (✅ items).
7. Run verification checks before stopping.
```

---

## 3. Completed Work

### ✅ [Task ID] — [Short title]

- [What changed]
- [Why]

**Verified**: ✓ [How verified]

---

## 4. Remaining Work

### □ [Task ID] — [Short title]

- [Subtask 1]
- [Subtask 2]
- [Subtask 3]

### □ [Task ID] — [Short title]

- [Subtask 1]
- [Subtask 2]

---

## 5. Important Constraints

### Do NOT

- [Action that must not happen]
- [Infrastructure that must not change]

### Must Preserve

- [Architecture or data that must remain intact]
- [Compatibility requirement]

---

## 6. Files Modified (Current Task Scope)

```
[path/to/modified/file]
[path/to/modified/file]
```

---

## 7. Files To Never Touch

```
[path/to/protected/file]        ← [reason]
[path/to/protected/file]        ← [reason]
```

---

## 8. Verification Status

```
✓ [check that passed]              ([date])

Pending
□ [check not yet run]
```

---

## 9. Known Risks

```
1. [Risk description]
   → [Impact if ignored]

2. [Risk description]
   → [Impact if ignored]
```

---

## 10. Next Immediate Action

```
NEXT ACTION

Start [Task ID].

[Exact steps / commands]

Verify:
  - [Verification step 1]
  - [Verification step 2]

Do not begin [next task] until [this task] passes.
```

---

*Last updated: [date and time]*
*Updated by: [AI model name]*
