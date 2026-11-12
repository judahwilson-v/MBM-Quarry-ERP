// Provider grants deliberately deny settings credential columns. SELECT *
// would fail those grants, so every full-row sync/restore/diff reader uses
// the same explicit settings projection. Missing fields preserve local PINs.
export const SAFE_GLOBAL_SETTINGS_COLUMNS = 'id,quarry_name,gst_number,address,phone,default_printer,backup_folder,updated_at,enable_weighbridge,enable_fleet_maintenance,enable_customer_portal,enable_credit_locks';
export function syncReadProjection(table: string): string {
  return table === 'global_settings' ? SAFE_GLOBAL_SETTINGS_COLUMNS : '*';
}

export function syncResponseRows(value: unknown): Record<string, any>[] {
  if (value === null) return [];
  if (!Array.isArray(value) || value.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('Sync response rows are invalid.');
  }
  return value;
}
