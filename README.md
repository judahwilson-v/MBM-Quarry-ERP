# MBM Quarry ERP

Next.js quarry operations system for sales, dispatch, accounts, inventory, reports, and boulder purchases.

## Production Stack

- Website: Vercel
- Database: PostgreSQL, preferably Neon or Supabase
- ORM: Prisma
- Auth: NextAuth credentials provider

## Required Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
NEXTAUTH_SECRET="long-random-secret"
NEXTAUTH_URL="https://your-production-domain"
```

For local Docker-only development, `DB_PASSWORD` and `APP_PORT` are also supported.

## Production Deployment

1. Create a PostgreSQL database in Neon or Supabase.
2. Copy the production connection string into `DATABASE_URL`.
3. Set `NEXTAUTH_SECRET` to a long random value.
4. Set `NEXTAUTH_URL` to the final Vercel production URL.
5. Connect this GitHub repository to Vercel.
6. In Vercel, use the default Next.js build command:

```bash
npm run build
```

7. Run database migrations against the production database:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require" npx prisma migrate deploy
```

8. Seed the owner user and default materials:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require" npx prisma db seed
```

Seeded login:

```text
admin@mbm.com
changeme123
```

Change this password after first login.

## Current Operations Modules

- Sales dashboard with today, week, and month filters
- Fast sale entry with searchable free-typing party and vehicle comboboxes
- Automatic master creation for typed party, vehicle, and supplier names
- Separate `OUR PURCHASE (BOULDER)` register
- Daily, weekly, monthly, material-wise, customer ledger, supplier ledger, and boulder purchase reports
- PostgreSQL-backed storage only for operational entries

## Local Development

Local development can still use Docker Postgres:

```bash
cp .env.example .env.local
docker compose --env-file .env.local up -d db
npx prisma migrate deploy
npx prisma db seed
npm run dev:4000
```

Production does not depend on localhost or your Mac staying on.
