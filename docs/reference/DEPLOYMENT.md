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
2. Push git tag `vX.Y.Z` or run `npm run release:patch|minor|major`.
3. GitHub Actions builds and publishes all 5 compulsory assets:
   - `latest.yml` (update manifest)
   - `MBM-Quarry-V2-Setup-X.Y.Z.exe` (NSIS installer)
   - `MBM-Quarry-V2-Setup-X.Y.Z.exe.blockmap` (differential blockmap for delta updates)
   - `Source code (zip)`
   - `Source code (tar.gz)`
4. Verify all 5 assets with `gh release view vX.Y.Z`.

## 5. Auto-Updater (Active — D-011)
Infrastructure is operational (`electron-updater`).
1. `autoUpdater.checkForUpdatesAndNotify()` is enabled in `desktop/main.js`.
2. Checks GitHub Releases feed for new `.exe` versions and downloads/applies updates.
3. User data remains safe in `%APPDATA%/mbm-quarry-erp/quarry.db` because it lives outside the installation directory.

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
