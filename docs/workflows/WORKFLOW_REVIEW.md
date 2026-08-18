---
type: workflow
id: SET-5
name: Independent Review
last_updated: "2026-08-18"
triggers: [review, audit, verify, check work]
---

# Multi-Agent Review Protocol

## Step 1: Load Context
Read the original task contract or spec. Do NOT read the implementer's conversation or self-report.

## Step 2: Scope Verification
Run `git diff --stat` to see exactly which files were modified. Flag any files changed that are outside the task's declared scope.

## Step 3: Spec Compliance
For each acceptance criterion in the task contract, independently verify it is met by examining the actual code changes.

## Step 4: Collateral Damage Check
Verify no unrelated functionality was broken. Check for: removed comments/docstrings, changed imports that affect other modules, modified test expectations, altered database schema without protocol.

## Step 5: Regression Gate
Run the full verification suite: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`. All must pass.

## Step 6: Security Posture
Check for: hardcoded secrets, disabled RLS, removed validation, new unvalidated user inputs.

## Step 7: Verdict
Issue PASS, PASS WITH NOTES, or FAIL with specific evidence for each finding.

## Reviewer Checklist

| Check | Description | Status |
|---|---|---|
| Scope | Only allowed files were modified | [ ] |
| Specs | All acceptance criteria met | [ ] |
| Damage | No collateral damage (comments, imports, tests) | [ ] |
| Regression | All verification commands passed | [ ] |
| Security | No security issues introduced | [ ] |
