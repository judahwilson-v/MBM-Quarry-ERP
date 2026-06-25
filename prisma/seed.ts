import { ensureDatabase } from "../src/lib/prisma";

async function main() {
  await ensureDatabase();
}

main()
  .then(() => {
    console.log("Local SQLite database is ready.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
