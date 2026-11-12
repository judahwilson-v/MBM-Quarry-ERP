// Settings credentials belong to this device. Never use a remote PIN or a
// schema default to replace them during cloud restore. Values stay in memory
// and database-to-database, never logs/exports/cloud payloads.
export function preserveLocalSettingsSecrets(
  remote: Record<string, unknown>[],
  local: { id: string; adminPin: string; deletePin: string }[],
): Record<string, unknown>[] {
  const byId = new Map(local.map(row => [row.id, row]));
  return remote.map(row => {
    const id = String(row.id ?? '');
    const current = byId.get(id);
    if (!current || !current.adminPin || !current.deletePin) {
      throw new Error('Cloud restore cannot preserve this device settings credentials. Keep the current database and review settings first.');
    }
    const {admin_pin: _a, delete_pin: _d, adminPin: _c, deletePin: _e, ...safe} = row;
    return { ...safe, adminPin: current.adminPin, deletePin: current.deletePin };
  });
}

// Do not log the raw exception. ORM diagnostics can render the merged local
// credential values even when the remote payload contained no credentials.
export function safeCloudRestoreError(error: unknown): string {
  const raw = error instanceof Error ? error.message : '';
  if (/^(Restore refused:|Cloud restore cannot preserve this device settings credentials\.|Required field [A-Za-z0-9_.]+ is null or missing in remote data$)/.test(raw) &&
      !/adminPin\s*:|deletePin\s*:|admin_pin\s*:|delete_pin\s*:|Prisma|Invalid .* invocation/i.test(raw)) return raw;
  return 'Cloud restore could not be completed safely. The current database was kept or recovery is required before continuing.';
}
