# Original User Request

## 2026-08-17T10:46:42Z

# Teamwork Project Prompt — Draft

> Requested team: Standard full team

Research the documentation in `D:\mbm file\project\MBM1\docs\_temp`, specifically analyzing the PDF files containing replies from ChatGPT and Gemini. Focus on "part 1" and sections designated as "ai setup" or meant for the agent. Extract the suggested practices and correlate them with the existing codebase to identify which ones have already been implemented and which are pending. Do not implement any new features.

Working directory: D:\mbm file\project\MBM1
Integrity mode: development

## Requirements

### R1. Document Analysis
Analyze the PDF files in `D:\mbm file\project\MBM1\docs\_temp`, specifically the content containing replies from ChatGPT and Gemini. Identify sections related to "part 1" and extract practices/tasks designated as "ai setup" or meant for the agent. Ignore tasks designated for the user.

### R2. Codebase Correlation
Search the existing codebase at `D:\mbm file\project\MBM1` to cross-reference the extracted practices. Determine the implementation status of each practice.

## Acceptance Criteria

### Verification Rubric (Agent-as-judge)
- [ ] The output is a comprehensive research report.
- [ ] The report clearly lists the practices extracted from the ChatGPT and Gemini replies under "part 1" or "ai setup".
- [ ] Every listed practice includes its current status ("Already Built" or "Pending").
- [ ] For practices marked as "Already Built", the report provides specific file paths and line numbers or code snippets as evidence from the codebase.
- [ ] The project workspace remains unmodified (no new code is implemented).
- [ ] The final report and plan MUST be structured in a phase-wise manner.
- [ ] The team MUST keep updating the markdown report artifact continuously as information is found, rather than waiting until the end.
- [ ] You may use web search to verify practices. This will run until 5:15 PM.

## 2026-08-18T10:50:00Z

# Teamwork Project Prompt — Draft

> Status: Step 1 — Eliciting project idea
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: [none — teamwork routes from the description]

Re-read the provided AI setup PDF and extract all integrations, tools, apps, and UI recommendations designed to help the human developer personally (as a "vibe coder"). Do not modify any codebase files.

Working directory: D:\mbm file\project\MBM1
Integrity mode: development

## Requirements

### R1. Document Review
Read and analyze the PDF file located at `D:\mbm file\project\MBM1\docs\_temp\AI Coding Workflow Implementation Plan (1).pdf`.

### R2. Extract Human-Centric Tools
Identify and extract any mentioned tools, applications, UI components, third-party integrations, or workflows that are intended to assist the human developer personally (often referred to as "vibe coding" tools). This is the exact opposite of the previous task — focus on what the *human* uses, not the AI.

### R3. Generate Report
Compile the findings into a structured Markdown report in the `docs/_temp/` directory. The report should categorize the tools (e.g., UI, Integrations, Workflow). Do not modify any application source code.

## Acceptance Criteria

### Verification Rubric (Agent-as-judge)
- [ ] A new markdown report is created in `docs/_temp/`.
- [ ] The report explicitly lists tools and integrations meant for the human developer.
- [ ] The report explains how each tool helps the developer personally.
- [ ] No application code or configuration files are modified.
