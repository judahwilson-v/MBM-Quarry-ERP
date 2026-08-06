# Project: MBM Quarry V2 Remaining Bugs Resolution

## Architecture
- Framework: Next.js App Router with Server Actions (`src/app/actions/*.ts`)
- UI / Components: React Client Components (`src/components/`, `src/app/`)
- Type System: TypeScript, Zod Schema Validation (`src/lib/validators/schemas.ts`)
- DB / ORM: Prisma ORM (`prisma/schema.prisma`), SQLite with custom bootstrap script (`src/lib/bootstrap.ts`)

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | ESLint & Unused Imports Cleanup (KB-014) | Run ESLint autofix and purge unused imports/helpers across `src/app/actions/*.ts` | M1 | KB-014 |
| 2 | Window Electron & Transaction Types (KB-015) | Create `src/types/global.d.ts` for `window.electron` and type transaction clients as `Prisma.TransactionClient` | M1 | KB-015 |
| 3 | Domain Interface Aliases (KB-013) | Replace `type Row = any` aliases with domain interfaces in `employees-page.tsx`, `fuel-management-page.tsx`, `vehicle-expenses-page.tsx` | M1 | KB-013 |
| 4 | Double Type Casts Removal (KB-012) | Remove 18 `as unknown as` double casts in UI components using explicit DTO response types | M1 | KB-012 |
| 5 | Zod Schema Validation (KB-021) | Implement shared Zod validation schemas in `src/lib/validators/schemas.ts` and validate inputs across 5 primary Server Actions | M2 | KB-021 |
| 6 | DayBook Array Guarding (KB-016) | Use nullish coalescing default `data?.transfers ?? []` in `day-book-page.tsx` | M3 | KB-016 |
| 7 | Mobile Layout Grid Breakpoints (KB-010) | Fix mobile squishing in `app-shell.tsx` and use `grid-cols-1 sm:grid-cols-2` in `dashboard.tsx` and `fuel-management-page.tsx` | M3 | KB-010 |
| 8 | Accessibility Input Bindings (KB-009) | Add explicit `id` / `htmlFor` / `aria-label` bindings across forms in `sales-entry-form.tsx`, `boulder-purchases-page.tsx`, `credit-pages.tsx`, `settings/page.tsx` | M3 | KB-009 |
| 9 | Documentation Synchronization & Verification | Update `docs/KNOWN_BUGS.md` and `docs/PROJECT_STATE.md` to mark all target bugs as Resolved | M4 | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: TypeScript & Lint Cleanup | KB-014, KB-015, KB-013, KB-012 | None | DONE |
| 2 | M2: Zod Input Validation | KB-021 | M1 | DONE |
| 3 | M3: UI & Accessibility Fixes | KB-016, KB-010, KB-009 | None | DONE |
| 4 | M4: Docs Sync & Verification | `docs/KNOWN_BUGS.md`, `docs/PROJECT_STATE.md` | M1, M2, M3 | PLANNED |

## Interface Contracts
### Server Actions & Zod Validation
- Shared schemas located at `src/lib/validators/schemas.ts`.
- Input validation via `schema.parse(data)`. Validation errors wrapped via `sanitizeError`.
- Server Actions return explicit DTO types (`Serialized<T>`) without `any` casts.

## Code Layout
- Server Actions: `src/app/actions/*.ts`
- Shared Validators: `src/lib/validators/schemas.ts`
- Type Declarations: `src/types/global.d.ts`
- UI Pages & Components: `src/app/`, `src/components/`
- Documentation: `docs/KNOWN_BUGS.md`, `docs/PROJECT_STATE.md`
