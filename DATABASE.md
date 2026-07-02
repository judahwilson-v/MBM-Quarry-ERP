# DATABASE

## Architecture
The application uses **SQLite** for local, offline-first data storage.
**Prisma** is the ORM used to interact with the database.

## Critical Rules ("Never Change")
1.  **Never reset databases or delete migrations.**
2.  **Never recreate schemas.**
3.  **Never rename Prisma models or database columns.**
4.  **Never modify IDs or change relations.**
    *(Unless explicitly instructed and approved by the user).*
5.  **Always preserve existing user data.**
6.  **Prefer additive migrations.** Backward compatibility is mandatory.

## SQLite Pathing (Production vs Dev)
*   In development: The database is located at prisma/dev.db.
*   In production (Electron): The database is located in the user's %APPDATA% folder (C:\Users\<User>\AppData\Roaming\<App>\quarry.db).
*   **Crucial Packaging Logic:** The packaged Electron app ships with a pristine local.db inside its esources/standalone/prisma folder. If %APPDATA%\quarry.db does not exist (or gets corrupted), the app copies local.db into %APPDATA% to initialize or Factory Reset the app.

## Migration Strategy
Because this is an offline desktop app distributed via .exe, running standard prisma migrate deploy on the client machine is difficult.
*   Schema changes must be carefully managed.
*   Currently, schema mismatches between the compiled Next.js standalone app and the user's local quarry.db will cause a fatal 500 error on boot.
*   **Future Strategy:** Migrations must either be handled manually via SQLite queries on boot, or by forcing a Factory Reset if the data can be fully re-synced from Supabase.

## Sync Assumptions
*   Supabase is the cloud source of truth.
*   Local SQLite handles all immediate reads/writes for speed and offline capability.
*   Sync logic must resolve conflicts gracefully.
