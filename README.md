# MBM Quarry ERP

An offline-first desktop ERP system for quarry management, built with Next.js, SQLite (Prisma), and Electron.

## Quick Start (Development)

```bash
npm install
npm run electron:dev    # Electron + Next.js dev server (recommended)
# or
npm run dev             # Next.js only (browser)
```

## Build & Package

```bash
npm run electron:package   # Builds and packages the Electron app
```

The build automatically stamps the `VERSION` file with the current date/time.

## Documentation

All documentation is in [`docs/`](./docs/).

| Document | Purpose |
|----------|---------|
| [`AI_PROGRESS.md`](./AI_PROGRESS.md) | **Start here** — live AI progress checkpoint & developer onboarding |
| [`docs/AI_PROGRESS_TEMPLATE.md`](./docs/AI_PROGRESS_TEMPLATE.md) | Template for AI continuation checkpoints for long-running tasks |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System design and data flow |
| [`docs/AUTO_UPDATE.md`](./docs/AUTO_UPDATE.md) | Guide for automated background updates using electron-updater |
| [`docs/BUSINESS_RULES.md`](./docs/BUSINESS_RULES.md) | Quarry-specific business logic |
| [`docs/CHANGELOG.md`](./docs/CHANGELOG.md) | What changed in each release |
| [`docs/DATABASE.md`](./docs/DATABASE.md) | SQLite database architecture and migration strategy |
| [`docs/DATABASE_SCHEMA.md`](./docs/DATABASE_SCHEMA.md) | Exact database schema describing tables, columns, and relationships |
| [`docs/DECISIONS.md`](./docs/DECISIONS.md) | Why key choices were made |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | How to build, package, and deploy |
| [`docs/ENGINEERING_RULES.md`](./docs/ENGINEERING_RULES.md) | Production safety and escalation protocol for AI and developers |
| [`docs/FINANCIAL_EVENT_ARCHITECTURE.md`](./docs/FINANCIAL_EVENT_ARCHITECTURE.md) | Financial event system reference |
| [`docs/IDEAS.md`](./docs/IDEAS.md) | Unconfirmed feature ideas |
| [`docs/KNOWN_BUGS.md`](./docs/KNOWN_BUGS.md) | Active bugs, workarounds, and resolved post-mortems |
| [`docs/MAINTAINERS.md`](./docs/MAINTAINERS.md) | Maintainers guide outlining architecture, data flow, and safety |
| [`docs/OWNER_DASHBOARD_PRD.md`](./docs/OWNER_DASHBOARD_PRD.md) | Phase 8 owner dashboard specification |
| [`docs/PHASE_A_SYNC_AND_ERP_PROGRESS.md`](./docs/PHASE_A_SYNC_AND_ERP_PROGRESS.md) | Progress tracker for Phase A Sync and ERP Improvements |
| [`docs/PROJECT_STATE.md`](./docs/PROJECT_STATE.md) | Current version, phase, and blocking issues |
| [`docs/RELEASE.md`](./docs/RELEASE.md) | Process for publishing a new version and verifying auto-updates |
| [`docs/RELEASE_NOTES.md`](./docs/RELEASE_NOTES.md) | RC1 release notes |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | Confirmed upcoming phases |

## Tech Stack

- **Next.js 14** (App Router, React Server Components)
- **Prisma + SQLite** (offline-first, no network required)
- **Electron** (desktop packaging)
- **Supabase** (cloud sync, secondary)
- **TypeScript**

## Project Status

See [`docs/PROJECT_STATE.md`](./docs/PROJECT_STATE.md) for full status.
