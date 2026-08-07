# MBM Quarry ERP — Deployment

## 1. Development Workflow
```bash
npm run electron:dev     # Launches Next.js dev server + Electron window (uses prisma/dev.db)
npm run dev              # Next.js only (no Electron window)
```
- Data in dev mode is stored in `prisma/dev.db`.

## 2. Building for Production
```bash
npm run electron:package   # prebuild → Next.js build → electron-builder package
```
The `prebuild` step auto-stamps `VERSION` with the current date/time.
- Next.js compiles with `output: 'standalone'`.
- `electron-builder` packages the standalone server, `public/`, `.next/static/`, and the pristine `prisma/dev.db` into the Electron resources directory.
- Windows output: `portable` `.exe` + `nsis` installer (supports future auto-updates).

## 3. Data Persistence (Critical)
Business data is **never** overwritten during an application update.

On first launch, `main.js`:
1. Checks `%APPDATA%/mbm-quarry-erp/` (Windows) for `quarry.db`.
2. If absent → copies the pristine `prisma/dev.db` from the installation directory.
3. If present → uses it as-is.
4. Boots Next.js with `DATABASE_URL` pointing strictly to `quarry.db` in user-data.

App code (`C:\Program Files\MBM Quarry\`) is completely decoupled from app data (`%APPDATA%\mbm-quarry-erp\quarry.db`).

## 4. Release Workflow
1. Bump version in `package.json`.
2. Run `npm run electron:package` — this auto-stamps the `VERSION` file.
3. `electron-builder` outputs: installer `.exe`, blockmap `.yml`, portable executable.
4. Upload artifacts to a **GitHub Release** tagged `v1.0.x`.

## 5. Auto-Updater (Deferred — D-011)
Infrastructure is prepared (`electron-updater`) but disabled. After RC1 is validated at the quarry:
1. Enable `autoUpdater.checkForUpdatesAndNotify()` in `main.js`.
2. Point it at the GitHub Releases feed.
3. User data remains safe because it lives outside the installation directory.

## 6. Backup Strategy
- **Local backup**: Backup Manager (About page) copies `quarry.db` → `backups/quarry-backup-{timestamp}.bak`.
- **Export**: Streams `quarry.db` as a binary download for off-machine cold storage.
- **Import**: Uploads a `.db` file and overwrites `quarry.db` after explicit confirmation.
- **Cloud sync**: Supabase acts as a live offsite mirror via the sync engine.

## 7. Disaster Recovery
If the quarry PC fails:
1. Install the latest MBM Quarry ERP on a new PC.
2. Restore `quarry.db` from the most recent local backup **or** perform a full pull-sync from Supabase.

## 8. Supabase Setup (One-Time)
Run `supabase_schema.sql` in the Supabase SQL Editor before using Sync.
Run `supabase_rls_policies.sql` to apply Row Level Security.
