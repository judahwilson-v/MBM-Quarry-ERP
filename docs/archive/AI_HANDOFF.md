# AI Handoff

Read these files first:
- `PROJECT_STATE.md`
- `ROADMAP.md`
- `IDEAS.md`
- `CHANGELOG.md`
- `BUSINESS_RULES.md`
- `ARCHITECTURE.md`
- `KNOWN_BUGS.md`
- `DECISIONS.md`

Then inspect the repository.

Do not redesign the project.
Do not rewrite working features.
Continue from the current task in `PROJECT_STATE.md`.

If a doc conflicts with the codebase, verify the implementation and update the relevant document only when the code change is intentional.

Current operating notes:
- The application is stable as an Electron desktop app with SQLite persistence.
- Supabase sync exists and still needs full interactive validation.
- A full real-world QA pass at the quarry is still required before major new features.
- If you are resuming after a crash or account switch, start by checking `PROJECT_STATE.md` and `KNOWN_BUGS.md`.

When the user pastes an idea:
- Save it in `IDEAS.md` unless the user explicitly says it is approved for `ROADMAP.md`.
- Do not promote speculative ideas into the roadmap or project state without approval.
