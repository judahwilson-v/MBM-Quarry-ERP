// Date-only Day Book keys are stored at UTC midnight. Timestamp callers must
// keep the existing local business date, not extract the preceding ISO date.
export function businessDateLabel(value: string | Date = new Date()): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new Error('Business date is invalid.');
    }
    return value;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Business date is invalid.');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function businessDateKey(value: string | Date = new Date()): Date {
  return new Date(`${businessDateLabel(value)}T00:00:00.000Z`);
}

export function businessDayBounds(value: string | Date = new Date()) {
  const label = businessDateLabel(value);
  const start = new Date(`${label}T00:00:00`);
  const endExclusive = new Date(start);
  endExclusive.setDate(endExclusive.getDate() + 1);
  return { start, endExclusive };
}

// Date input labels represent local business days; explicit instants retain their
// exact time. This is for new writes only, not a historical date migration.
export function businessTimestampForWrite(value: string | Date): Date {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return businessDayBounds(value).start;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Business timestamp is invalid.');
  return date;
}
