# PROJECT_STRUCTURE

## Folder Layout

*   **desktop/**: Contains the Electron wrapper code (e.g., main.js). This layer is responsible for launching the Next.js server locally, managing the application window, and handling database file operations (like the Factory Reset fallback).
*   **prisma/**: Contains the Prisma schema (schema.prisma), migrations, and the development/bundled local SQLite database files.
*   **scripts/**: Contains utility scripts, such as manual database migration scripts (migrate.js).
*   **src/**: The core Next.js application.
    *   **src/app/**: Next.js App Router definitions. Contains pages and layouts for the UI.
    *   **src/components/**: Reusable React components (UI components, modules, layout shells).
    *   **src/lib/**: Core business logic, database access, and utilities.
        *   **src/lib/domain/**: Domain-driven service modules (e.g., inventory, daybook, ledger). This isolates business logic from the UI.
        *   **src/lib/prisma.ts**: The Prisma client instantiation logic.
        *   **src/lib/sales-engine.ts**: Complex calculations for pricing, GST, and totals.
        *   **src/lib/offline-actions.ts**: Core server actions for interacting with the database.
*   **package.json**: Defines dependencies, build scripts (Next.js standalone build), and packaging scripts (electron-builder).
