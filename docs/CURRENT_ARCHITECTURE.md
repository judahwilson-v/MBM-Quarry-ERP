# Current Architecture

MBM is an offline-first Next.js application backed by SQLite and Prisma.

## Runtime Shape

- `src/app` contains the route layer and page composition.
- `src/components/modules` contains feature-specific UI modules.
- `src/lib/offline-actions.ts` contains server actions and database mutations.
- `src/lib/prisma.ts` owns Prisma client access and local SQLite bootstrap logic.

## Existing Modules

- Sales
- Vehicle Master
- Party Master
- Material Master
- Boulder Purchases
- Customer Credit
- Employee Credit

## Data Flow

1. Client components call server actions.
2. Server actions validate and normalize input.
3. Prisma reads/writes the local SQLite database.
4. Shared list views render the returned rows in the existing UI.

## Foundation Constraints

- The app remains offline only.
- Existing routes and screen layouts are preserved.
- Legacy text-based fields remain in place for backward compatibility.
- New normalized foreign-key columns are added without removing the old columns yet.
