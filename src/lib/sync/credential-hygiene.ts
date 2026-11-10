// Sync-only projection, never an in-place edit or migration of local history.
// Settings PINs stay local. Omit fields instead of writing redaction markers
// into remote credential columns. Legacy audit payloads are JSON strings and
// need a separate projection before their enclosing row leaves the device.
const PRIVATE_FIELDS = new Set([
  "adminPin", "deletePin", "admin_pin", "delete_pin",
  "pinHash", "pinSalt", "pin_hash", "pin_salt",
]);

export function omitCredentialFields<T>(value: T): T {
  if (value instanceof Date || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(omitCredentialFields) as T;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (!PRIVATE_FIELDS.has(key)) result[key] = omitCredentialFields(child);
  }
  return result as T;
}

export function projectSyncRecord<T>(value: T): T {
  const projected = omitCredentialFields(value);
  if (!projected || typeof projected !== "object" || Array.isArray(projected)) return projected;
  const row = projected as Record<string, unknown>;
  // This module only handles GlobalSettings legacy audit snapshots. Unknown
  // entities and unrelated string fields retain their original values.
  if ((row.entityName === "GlobalSettings" || row.entity_name === "GlobalSettings") && typeof row.payload === "string") {
    const payload = JSON.parse(row.payload); // malformed credential-bearing audit fails closed
    row.payload = JSON.stringify(omitCredentialFields(payload));
  }
  return projected;
}
