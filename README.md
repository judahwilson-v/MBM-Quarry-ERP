This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Development Setup

Create `.env.local` from `.env.example` and set local values for `DB_PASSWORD`, `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, and `APP_PORT`.

Start Postgres, apply migrations, seed the owner user/materials, then run the app on port 4000:

```bash
docker compose --env-file .env.local up -d db
npx prisma migrate deploy
npx prisma db seed
npm run dev:4000
```

Open [http://localhost:4000](http://localhost:4000). The seeded owner login is `admin@mbm.com` / `changeme123`.

If you want to run the app container too, use:

```bash
docker compose --env-file .env.local up --build
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
