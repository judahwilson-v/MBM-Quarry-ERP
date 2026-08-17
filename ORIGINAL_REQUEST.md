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
