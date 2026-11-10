import { getDeliveryMode } from './delivery-gate';
import { resolveSyncModel } from './sync-config';

/** SQLite bootstrap stores TEXT dates; Prisma writes integer milliseconds.
 * SQLite compares TEXT as greater than an integer cursor regardless of age.
 * Prisma decodes both into Date, so apply the same chronological check for
 * delivery and status. This is read-only compatibility, not a timestamp rewrite.
 */
export async function findLegacyRowsAfter(delegate: any, timeField: string, cursor: Date, where: Record<string, unknown> = {}, countOnly = false): Promise<any[]> {
  const rows = await delegate.findMany({
    where: { ...where, [timeField]: { gt: cursor } },
    ...(countOnly ? { select: { [timeField]: true } } : { orderBy: { [timeField]: 'asc' } }),
  });
  return rows.filter((row: any) => {
    const date = row[timeField];
    const ms = date instanceof Date ? date.getTime() : new Date(date).getTime();
    if (!Number.isFinite(ms)) throw new Error(`Invalid legacy sync timestamp: ${timeField}`);
    return ms > cursor.getTime();
  });
}

/** Unknown entities remain actionable, never silently classified as parked. */
export function isActiveOutboxEntity(entityType: string): boolean {
  const model = resolveSyncModel(entityType);
  return !model || getDeliveryMode(model) === 'outbox';
}
