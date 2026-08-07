# 05_APP_ARCHITECTURE

This document provides a high-level overview of the MBM ERP frontend and backend architecture.

## 1. Core Stack
- **Framework**: Next.js 14 (App Router)
- **Desktop Wrapper**: Electron (packaged via `electron-builder`)
- **Database**: Prisma ORM with SQLite (`prisma/local.db`)
- **Cloud Sync**: Supabase (via `supabase-js`)
- **Styling**: Tailwind CSS + Shadcn UI
- **Language**: TypeScript

## 2. Folder Structure
```text
/src
  /app                  # Next.js App Router (Pages, Layouts, API routes)
    /api                # API Routes (Export/Import, Sync)
    /actions            # Next.js Server Actions
    /(routes)           # Feature pages (dashboard, sales, expenses, etc.)
  /components
    /ui                 # Reusable Shadcn UI components (Buttons, Dialogs)
    /layout             # Sidebar, TopBar, Wrappers
    /dashboard          # MetricCards, Charts
    /[feature]          # Feature-specific components (e.g. SalesTable)
  /lib
    /domain             # Core Business Logic (Repository/Service pattern)
    /sync               # Offline-first Supabase syncing logic
    prisma.ts           # Prisma client singleton
    utils.ts            # Shared utilities (Tailwind merges, date formatters)
/desktop
  main.js               # Electron main process (IPC, Auto-updater, Boot)
  preload.js            # Electron IPC bridge
/prisma
  schema.prisma         # Database schema
```

## 3. State Management
- **Server State**: Managed natively by Next.js Server Components and Server Actions. Prisma queries run directly in Server Components, eliminating the need for `React Query` or `Redux` for data fetching.
- **Client State**: `useState` and `useReducer` are used in Client Components (`"use client"`) for forms and UI toggles.
- **Form Handling**: Mostly controlled inputs passing payloads to Server Actions.

## 4. Components & Hooks
- **Shadcn UI**: Heavily utilizes Radix UI primitives.
- **Custom Hooks**: 
  - `useToast()` for global notifications.
- **Charts**: Recharts library is used for visual data representation (planned for Dashboard).

## 5. Providers
- `ThemeProvider`: Manages Dark/Light mode preferences.
- `ToastProvider`: Wraps the app to allow global toasts.

## 6. Desktop Integration (Electron)
- The Next.js app runs locally on `localhost:4000` via a spawned node process in `desktop/main.js`.
- **IPC (Inter-Process Communication)**:
  - `window.electron.printSilent()`: Triggers background thermal printing.
  - `window.electron.checkUpdates()`: Triggers GitHub release auto-updater.
  - `window.electron.onUpdaterEvent()`: Pushes download progress to React UI.
