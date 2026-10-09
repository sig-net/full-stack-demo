/** Postgres's `unique_violation`, whether pg raised it or a query wrapper carries it as the cause. */
export function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if ('code' in error && error.code === UNIQUE_VIOLATION) return true
  return isUniqueViolation(error.cause)
}

const UNIQUE_VIOLATION = '23505'
