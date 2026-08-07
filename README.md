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

> [!IMPORTANT]
> **For AI Agents:** All documentation has been consolidated into the **AI RAM**. 
> Please start by reading [`docs/AI_INDEX.md`](./docs/AI_INDEX.md) to navigate the project state, architecture, and rules. Do not crawl the repository randomly.

---

## Tech Stack

- **Next.js 14** (App Router, React Server Components)
- **Prisma + SQLite** (offline-first, no network required)
- **Electron** (desktop packaging)
- **Supabase** (cloud sync, secondary)
- **TypeScript**

## Project Status

See [`docs/handoff/AI_HANDOFF.md`](./docs/handoff/AI_HANDOFF.md) for full status.
