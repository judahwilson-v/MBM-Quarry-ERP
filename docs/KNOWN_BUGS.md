# MBM Quarry ERP — Known Bugs & Edge Cases

## Active Issues

### KB-001: Windows Production Build Missing
**Severity**: High  
The only packaged build is a macOS `.dmg`. A Windows `.exe` / `nsis` installer has not been produced yet.  
**Resolution**: Run `npm run electron:package` on a Windows machine (or in a CI environment with a Windows runner) to generate the Windows installer.

### KB-002: Supabase Sync Requires Manual Schema Setup
**Severity**: High  
The sync engine cannot access a new cloud project until its schema and authenticated RLS policies are installed. Sync failures are now logged with the affected table and record ID.
**Resolution**: For an existing project, run `supabase_phase_a_sync_migration.sql` and then `supabase_rls_policies.sql`. For a new project, run `supabase_schema.sql` followed by `supabase_rls_policies.sql`.

### KB-003: Silent Printing Not Yet Supported
**Severity**: Low  
The "Default Printer" field in Settings stores the printer name, but printing still opens the browser print dialog. True silent printing requires native Electron IPC integration.  
**Resolution**: Deferred to a future patch. Currently, printing is handled via browser `window.print()`.

### KB-004: Database Restore Requires Page Reload
**Severity**: Low  
Restoring from a backup while Prisma has an open connection can cause temporary connection pooling issues. The UI forces `window.location.reload()` after restoration.  
**Resolution**: Working as intended. A future improvement could use Electron IPC to restart the Next.js server cleanly.

### KB-005: `sync_state` Table Build Warning
**Severity**: Info  
During static generation (`npm run build`), Prisma may log an error about `main.sync_state` not existing if the local dev database has not been migrated.  
**Resolution**: Run `DATABASE_URL="file:./prisma/dev.db" npx prisma db push` to sync the schema.

## Resolved (RC1)
- *(none yet — tracking begins from RC1)*

## Resolved Post-Mortems

### KB-PM-001: Electron Startup Timeout (Prisma Schema Mismatch)
**Severity**: Critical (Resolved)  
**Symptom**: Packaged Windows `.exe` crashed on startup before window opened with dialog: *"Timeout waiting for Next.js server to boot."*  
**Root Cause**: Next.js threw a 500 error on boot because the Prisma schema compiled into standalone app did not match user's local SQLite database (`%APPDATA%/quarry.db`). Prisma rejected queries for missing columns.  
**Resolution**: 
1. Updated `package.json` to explicitly include `prisma/local.db` in `extraResources` for electron-builder.
2. Updated `desktop/main.js` to implement a "Factory Reset" fallback dialog if Next.js server times out, allowing users to restore pristine `local.db`.  
**Lesson**: Never assume local database schema matches the binary. Always provide a Factory Reset escape hatch for corrupted or outdated local databases.

### KB-PM-002: ZIP Extraction Pathing Issue
**Severity**: Medium (Resolved)  
**Symptom**: Extracting project ZIP file natively on Windows via `Expand-Archive` stripped top-level directory, flattening file paths and breaking relative imports and git context.  
**Resolution**: Used `tar -xf` to extract ZIP file while preserving full directory hierarchy.  
**Lesson**: Use directory-preserving extraction tools (`tar -xf`) for cross-platform archive transfers.

---

*Add new entries above the Resolved section. Format: `KB-NNN: Short title`, severity, description, resolution.*
