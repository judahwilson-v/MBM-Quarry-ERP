// Business date label derivation for form prefills.
// Day Book keys and business date-only inputs are local-midnight calendar labels.
// A stored instant must be shown as its LOCAL calendar date, never derived by
// splitting a UTC ISO string (which shifts the label one day behind for
// local-midnight instants stored ahead of UTC).
export function dateInputValue(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    const offset = new Date().getTimezoneOffset() * 60000;
    return new Date(Date.now() - offset).toISOString().slice(0, 10);
  }
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}
