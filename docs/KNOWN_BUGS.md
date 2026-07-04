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

---

*Add new entries above the Resolved section. Format: `KB-NNN: Short title`, severity, description, resolution.*
