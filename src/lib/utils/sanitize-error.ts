/**
 * Sanitize server-side errors before returning them to the client UI.
 * Prevents leaking raw SQL queries, table names, Prisma error codes,
 * and database constraint details to end users.
 */

const SENSITIVE_PATTERNS = [
  /prisma/i,
  /sqlite/i,
  /constraint/i,
  /unique.*violation/i,
  /foreign key/i,
  /SELECT\s+/i,
  /INSERT\s+/i,
  /UPDATE\s+/i,
  /DELETE\s+FROM/i,
  /CREATE\s+/i,
  /ALTER\s+/i,
  /DROP\s+/i,
  /P\d{4}/,           // Prisma error codes like P2002
  /SQLITE_ERROR/i,
  /SQLITE_CONSTRAINT/i,
  /SQLITE_BUSY/i,
  /no such column/i,
  /no such table/i,
  /invocation:$/i,
];

/**
 * Returns a user-friendly error message, stripping any internal database
 * or ORM details. Known business errors (e.g. "Vehicle number is required")
 * pass through unchanged.
 */
export function sanitizeError(error: unknown, fallback = "An unexpected error occurred. Please try again."): string {
  if (!error) return fallback;

  const raw = error instanceof Error ? error.message : String(error);

  // If the message contains sensitive DB/ORM internals, replace it
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(raw)) {
      console.error("[ServerAction] Sanitized error:", raw);
      return fallback;
    }
  }

  // Business logic errors pass through as-is
  return raw;
}
