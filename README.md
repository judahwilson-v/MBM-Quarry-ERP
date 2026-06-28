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
| [`docs/AI_HANDOFF.md`](./docs/AI_HANDOFF.md) | **Start here** — orientation for new developers or AI sessions |
| [`docs/PROJECT_STATE.md`](./docs/PROJECT_STATE.md) | Current version, phase, and blocking issues |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | Confirmed upcoming phases |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System design and data flow |
| [`docs/BUSINESS_RULES.md`](./docs/BUSINESS_RULES.md) | Quarry-specific business logic |
| [`docs/DECISIONS.md`](./docs/DECISIONS.md) | Why key choices were made |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | How to build, package, and deploy |
| [`docs/CHANGELOG.md`](./docs/CHANGELOG.md) | What changed in each release |
| [`docs/KNOWN_BUGS.md`](./docs/KNOWN_BUGS.md) | Active bugs and workarounds |
| [`docs/IDEAS.md`](./docs/IDEAS.md) | Unconfirmed feature ideas |
| [`docs/RELEASE_NOTES.md`](./docs/RELEASE_NOTES.md) | RC1 release notes |
| [`docs/OWNER_DASHBOARD_PRD.md`](./docs/OWNER_DASHBOARD_PRD.md) | Phase 8 owner dashboard specification |
| [`docs/FINANCIAL_EVENT_ARCHITECTURE.md`](./docs/FINANCIAL_EVENT_ARCHITECTURE.md) | Financial event system reference |

## Tech Stack

- **Next.js 14** (App Router, React Server Components)
- **Prisma + SQLite** (offline-first, no network required)
- **Electron** (desktop packaging)
- **Supabase** (cloud sync, secondary)
- **TypeScript**

## Project Status

**RC1 — v0.1.0-rc1** · Field Testing phase
See [`docs/PROJECT_STATE.md`](./docs/PROJECT_STATE.md) for full status.
