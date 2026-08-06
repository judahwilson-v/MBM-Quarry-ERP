export type Serialized<T> = T extends Date
  ? string
  : T extends Array<infer U>
  ? Array<Serialized<U>>
  : T extends object
  ? { [K in keyof T]: Serialized<T[K]> }
  : T;

const dateTimeKeys = new Set(["createdAt", "updatedAt", "saleDate", "date", "expectedDueDate"]);

export function serialize<T>(value: T): Serialized<T> {
  if (value instanceof Date) {
    try {
      return value.toISOString() as any;
    } catch {
      return null as any;
    }
  }
  if (Array.isArray(value)) {
    return value.map((item) => serialize(item)) as any;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        entry instanceof Date || dateTimeKeys.has(key) ? serialize(entry) : serialize(entry),
      ])
    ) as any;
  }
  return value as any;
}
