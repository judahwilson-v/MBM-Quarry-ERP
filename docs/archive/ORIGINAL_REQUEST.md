# Original User Request

## 2026-08-05T15:03:42Z

Perform a comprehensive, read-only documentation audit of the MBM Quarry ERP repository (containing ~110 Markdown files) using a multi-agent divide-and-conquer strategy to map the true "Source of Truth", detect duplicates, and resolve contradictions across active documents.

Working directory: `D:\mbm file`
Integrity mode: development

**Definition of Source of Truth:** 
The current authoritative document that should be referenced for active development. Historical, archived, audit, release, handoff, and changelog documents are not Sources of Truth unless explicitly designated.

## Requirements

### R1. Independent Conceptual Audits
Group the repository's Markdown files (excluding `node_modules`) into logical conceptual domains (e.g., Architecture, Database, Business, Planning/Phases, AI Handoffs, Release Notes). Delegate small, independent audit missions to analyze each domain. For each domain, the assigned sub-agent must read the contents of the files to determine overlaps, identify the authoritative document(s), and note true duplicates.

### R2. Cross-Reference and Aggregation
After the independent audits conclude, cross-reference the authoritative documents from each conceptual domain against each other to find active repository-wide duplicates and contradictions.

### R3. Final Source of Truth Report
Produce a final, single repository-wide summary report. The report must contain:
1. A master map explicitly recommending to **Keep, Merge, Delete, or Historical (leave as-is)** for every `.md` file audited.
2. **Mandatory Evidence**: Every Merge or Delete recommendation must include:
   - Why
   - Which file overlaps
   - What sections overlap
   - Confidence (High/Medium/Low)
3. Missing documentation identified.
4. A Documentation Health Score.
**Strict Constraint**: Do not modify, move, or delete any files. This is a read-only analysis.

## Acceptance Criteria

### Coverage & Integrity
- [ ] An automated script successfully verifies that the final report explicitly categorizes every single `.md` file found in the repository (excluding `node_modules`) using the strict categories: Keep, Merge, Delete, or Historical.
- [ ] Verification confirms that zero files in the repository were modified, moved, or deleted during the process.

### Quality Assurance
- [ ] An independent Judge Agent reviews the final report and confirms there are zero logical contradictions (e.g., conflicting "Source of Truth" designations for the same domain).
- [ ] The Judge Agent verifies that every single "Merge" or "Delete" recommendation includes the required evidence fields (Why, Overlapping File, Overlapping Sections, Confidence).
- [ ] The final report clearly outputs a "Documentation Health Score".

## 2026-08-05T15:44:30Z

Execute the 7 file merges and 8 file deletions recommended in Section 3 of `SOURCE_OF_TRUTH_REPORT.md` to safely consolidate and clean up the repository's documentation.

Working directory: `D:\mbm file`
Integrity mode: development

## Requirements

### R1. Execute Deletions
Locate and safely delete the 8 obsolete files explicitly marked for deletion in Section 3 of the `SOURCE_OF_TRUTH_REPORT.md` artifact.

### R2. Execute Intelligent Merges
For the 7 files recommended for merging in the report:
1. Extract the unique content/details from the overlapping file.
2. Intelligently weave this content into the appropriate sections of the target canonical document (Source of Truth).
3. Resolve any redundancies or contradictions to ensure the final document reads cohesively.
4. Delete the original overlapping file once the merge is complete.

### R3. Version Control State
Do not commit any of the changes to Git. Leave all file deletions and modifications uncommitted in the working tree so the user can easily review the full diff.

## Acceptance Criteria

### Execution & Cleanliness
- [ ] An automated script successfully verifies that all 8 files slated for deletion no longer exist in the filesystem.
- [ ] An automated script successfully verifies that all 7 overlapping files slated for merging no longer exist in the filesystem.
- [ ] An automated script verifies `git status` shows zero new commits made by the agents.

### Quality Assurance
- [ ] An independent Judge Agent reviews the git diffs of the target canonical documents and confirms that the unique information from the merged files was successfully woven in without losing critical context or creating awkward, disconnected sections.

## 2026-08-05T17:56:44Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Execute the codebase audit and document findings

Conduct a comprehensive codebase audit on the MBM Quarry V2 project (similar to the `mbm-audit` skill) using a divide-and-conquer approach. The objective is strictly discovery and documentation: identify errors (TypeScript, hydration, schema, etc.), search for similar patterns across the repository, and update the corresponding markdown documentation. Do NOT fix the code.

Working directory: d:\mbm file\project\MBM1

## Requirements

### R1. Divide and Conquer Execution
The audit must be parallelized among multiple agents (e.g., one agent checks TypeScript/ESLint, another checks Prisma/Schemas, another checks React Hydration/Component issues). 

### R2. Discovery and Pattern Matching Only
Agents must focus exclusively on finding errors and searching the repository for identical or similar problematic patterns. Agents must NOT modify any source code (`.ts`, `.tsx`, `.prisma`, etc.) to fix the issues.

### R3. Comprehensive Documentation Updates
When errors or problematic patterns are found, agents must update the corresponding markdown files (e.g., `docs/KNOWN_BUGS.md`, `docs/PROJECT_STATE.md`) with their findings. The audit is not complete until the entire codebase has been scanned and all findings are documented.

## Acceptance Criteria

### Audit Completion
- [ ] At least 3 distinct audit categories (e.g., Type/Lint, Schema/DB, React/UI) have been executed.
- [ ] No source code files have been modified.
- [ ] Discovered bugs and patterns have been successfully appended to the project's markdown documentation in `docs/`.

## 2026-08-06T02:03:44Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Fix Database & Backend Bugs via teamwork_preview

Resolve the three remaining Database & Backend bugs documented in `docs/KNOWN_BUGS.md` (KB-023, KB-025, KB-026) using a divide-and-conquer approach across a team of specialized agents.

Working directory: d:\mbm file\project\MBM1
Integrity mode: development

## Requirements

### R1. Database Indexing (KB-026)
Add missing performance indexes to `schema.prisma` and ensure corresponding raw `CREATE INDEX` queries are safely injected into `src/lib/bootstrap.ts` for backward compatibility. (e.g. indexing `createdAt`, `partyId`, etc. as documented).

### R2. Weighbridge Ticket Race Condition (KB-025)
Refactor `createWeighbridgeTicket` to prevent concurrent requests from generating duplicate ticket sequence numbers, ensuring atomic sequence generation.

### R3. Safe Error Exposure (KB-023)
Implement a sanitized error-handling mechanism for server actions so that raw SQL strings, table names, or database constraints are no longer leaked directly to the client UI. Internal errors must be logged, and safe fallback messages returned.

### R4. Documentation Synchronization
Update `docs/KNOWN_BUGS.md` and `docs/PROJECT_STATE.md` to mark the targeted bugs as resolved once fixes are verified.

## Acceptance Criteria

### Verification
- [ ] `schema.prisma` successfully compiles with `npx prisma validate` after adding the missing indexes.
- [ ] The `tsc --noEmit` build succeeds without type errors after modifying server actions.
- [ ] No server action throws a direct `error.message` that originates from a raw Prisma database error.
- [ ] `KNOWN_BUGS.md` has been updated to mark KB-023, KB-025, and KB-026 as `(Resolved)`.

