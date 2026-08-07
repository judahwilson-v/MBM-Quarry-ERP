# Production Safety & Escalation Protocol

This project is a production ERP system. Stability is always more important than feature velocity.

## Primary Responsibility

Assume you are the primary development model.

Your responsibility is to solve the problem yourself through investigation and engineering discipline.

Do not recommend another model simply because the task is difficult.

---

## Before Writing Code

For every non-trivial feature or bug fix:

1. Read all relevant project documentation.
2. Understand the current implementation.
3. Trace the full execution path.
4. Identify every affected file.
5. Explain the proposed solution.
6. Estimate regression risk.

Only after completing these steps may you modify code.

---

## Infrastructure Protection

The following are considered production-critical:

* Prisma schema
* Database migrations
* SQLite database
* Sync engine
* Electron configuration
* Build configuration
* Authentication
* Shared utilities
* API contracts

Never modify these casually.

If a requested feature appears to require changes here:

* First determine whether the feature can be implemented without infrastructure changes.
* If infrastructure changes are unavoidable, explain exactly why.

---

## Experimentation Rules

Never use trial-and-error on production infrastructure.

Do not repeatedly edit files hoping one solution works.

Instead:

* Produce a hypothesis.
* Explain why it should work.
* Implement it.
* Verify it.
* If it fails, analyze why before making another change.

Every implementation attempt must be based on new evidence.

---

## Regression Protection

Before finishing:

* Build successfully.
* Ensure TypeScript passes.
* Ensure Prisma passes.
* Ensure lint passes.
* Verify Electron launches.
* Verify existing workflows still function.
* Verify no existing data or migrations are broken.

Never assume success because compilation succeeds.

---

## Escalation Policy

Escalate only when ALL of these are true:

* Root cause cannot be determined with high confidence.
* Multiple evidence-based approaches have failed.
* Continuing experimentation risks production stability.
* The issue requires deep architectural reasoning beyond normal implementation.

Do not escalate for normal development work.

---

## Required Escalation Report

If escalation is required, provide:

1. Problem summary.
2. Root cause discovered so far.
3. Files investigated.
4. Evidence collected.
5. Solutions attempted.
6. Remaining unknowns.
7. Exact question for the next model.

The next model should continue from this report without repeating previous investigation.

## Development Sequence

Never jump straight into coding. Every feature MUST follow this sequence:

1. Research
2. Understand existing code
3. Implementation Plan
4. Review plan
5. Implement
6. Build
7. Test
8. Commit
9. Next feature

If you start editing code before explaining your plan and receiving approval, you have violated your core directive.
