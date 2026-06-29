# KNOWN_ISSUES

## 1. Electron Startup Timeout (Prisma Schema Mismatch)
**The Bug:** The packaged Windows .exe crashed on startup before the window even opened, showing a dialog box: "Timeout waiting for Next.js server to boot."
**The Root Cause:** Next.js threw a 500 error immediately on boot because the Prisma schema compiled into the standalone app did not match the user's local SQLite database (quarry.db in %APPDATA%). Prisma violently rejected queries for missing columns, killing the Next.js server instantly.
**The Resolution:** 
1. The package.json was updated to explicitly include prisma/local.db in the extraResources for electron-builder.
2. desktop/main.js was updated to implement a "Factory Reset" escape hatch. If the Next.js server times out, the app asks the user if they want to Factory Reset, which wipes the corrupted/outdated %APPDATA%/quarry.db and replaces it with the pristine local.db packaged with the app.
**Lesson:** Never assume the local database schema matches the binary. Always provide an escape hatch for corrupted or outdated local databases, and ensure local.db is correctly packaged.

## 2. ZIP Extraction Pathing Issue
**The Bug:** Extracting the project ZIP file natively on Windows using Expand-Archive stripped the top-level directory, causing files to be extracted flatly, breaking relative paths and Git context.
**The Resolution:** Used 	ar -xf to properly extract the ZIP file and maintain directory structures.
**Lesson:** Be careful with cross-platform file transfers and extraction tools.
