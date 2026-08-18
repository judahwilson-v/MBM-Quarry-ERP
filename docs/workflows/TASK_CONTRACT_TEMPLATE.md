---
type: workflow
id: TEMPLATE-1
name: Task Contract Template
last_updated: "2026-08-18"
---

# TASK CONTRACT: [Task Title]

## OBJECTIVE
[One-sentence description of what must be accomplished]

## SCOPE
- **Files to create**: [list]
- **Files to modify**: [list with specific changes]
- **Files that MUST NOT be touched**: [list]

## SOURCE OF TRUTH
- [List the authoritative docs/files for this task]

## EXISTING ARCHITECTURE
- [Brief description of how the current system works in the area being modified]

## REQUIRED BEHAVIOR
- [Numbered list of specific behaviors the implementation must exhibit]

## FORBIDDEN CHANGES
- [Explicit list of things the agent must NOT do]
- Do not modify files outside the scope
- Do not introduce new dependencies without approval
- Do not refactor unrelated code

## ACCEPTANCE CRITERIA
- [ ] [Objective, checkable condition 1]
- [ ] [Objective, checkable condition 2]

## VERIFICATION COMMANDS
```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
git diff --stat
```

## STOP CONDITION
[When to stop: "Stop when all acceptance criteria pass and verification commands return exit code 0"]
