# Deployment Architecture: MBM Quarry ERP

This document outlines the architecture for deploying, updating, and maintaining the MBM Quarry ERP application across different environments (from the developer's machine to the production quarry PCs).

## 1. Development Workflow
The application is built using a hybrid architecture:
- **Frontend & Backend API**: Next.js (App Router)
- **Database Engine**: SQLite with Prisma ORM
- **Desktop Container**: Electron

During development:
- Run `npm run electron:dev`
- This runs the Next.js development server locally and concurrently launches an Electron window pointing to `localhost:3005`.
- Data is stored in `prisma/dev.db`.

## 2. Packaging Workflow
The application uses `electron-builder` to package the Next.js server, Prisma engine, and Electron container into a single distributable.
- Run `npm run electron:builder` (or `npm run build` then `npm run electron:package`).
- The Next.js app is compiled using `output: 'standalone'`, creating a self-contained Node.js server.
- The `standalone` folder, `public` folder, `.next/static` folder, and the pristine `prisma/dev.db` are copied into the Electron resources directory (`app.asar.unpacked` or just `resources/`).
- The output target for Windows includes both `portable` (for immediate run-without-install) and `nsis` (for full installation and auto-update support).

## 3. Data Persistence Strategy
**CRITICAL**: Business data must NEVER be overwritten during an application update.

To achieve this:
1. When the packaged app starts, `main.js` checks the OS-specific user data directory (`%APPDATA%/mbm-quarry-erp` on Windows) for `quarry.db`.
2. If `quarry.db` does not exist, the pristine database (`prisma/dev.db`) is copied from the installation folder to the user data directory.
3. If `quarry.db` already exists, the application uses it as-is.
4. The Next.js server is booted with the `DATABASE_URL` environment variable pointing strictly to the `quarry.db` in the user data directory.

The application code (`C:\Program Files\MBM Quarry\...`) is thus completely decoupled from the application data (`%APPDATA%\mbm-quarry-erp\quarry.db`).

## 4. Release Workflow
Releases are managed via GitHub Releases (or an S3 bucket).
1. The developer bumps the version in `package.json` and updates the `VERSION` file.
2. The developer builds the application (`npm run electron:package`).
3. `electron-builder` generates an installer (`.exe`), an update blockmap (`.yml`), and a portable executable.
4. These artifacts are uploaded to a GitHub Release tagged with the version number (e.g., `v1.0.2`).

## 5. Update Workflow (Stage 3 & 4)
The application is prepared for seamless, automatic updates using `electron-updater`:
1. **Check**: On startup, `main.js` uses `autoUpdater.checkForUpdatesAndNotify()`.
2. **Download**: If a new version is detected on the release server, the update patch is downloaded in the background.
3. **Install**: Once downloaded, the user is prompted to restart (or it applies on the next normal restart).
4. **Data safety**: Because the application code is updated in `Program Files` and data lives in `%APPDATA%`, the user's SQLite database remains completely untouched and safe.

*Note: In the current stage (Stage 1 & 2), the auto-updater functionality is stubbed out but disabled to allow for manual feedback gathering first.*

## 6. Backup Strategy
- **Local Database Backup**: The user data directory contains `quarry.db`. This single file contains all business data.
- **Cloud Sync**: A Supabase cloud database acts as an offsite backup and synchronization point. Changes made locally are synced to the cloud via the offline-first action queue.

## 7. Disaster Recovery
If a Quarry PC fails completely:
1. Obtain a new PC.
2. Install the latest version of the MBM Quarry ERP application.
3. Replace the `quarry.db` in the user data folder with the most recent local backup, OR
4. Run a full synchronization from Supabase to pull down the master cloud state to a fresh local database.
