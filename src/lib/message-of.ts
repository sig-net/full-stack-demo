/** The error's message followed by its `cause` chain, so a stored message says what the deepest layer said. */
export function messageOf(error: unknown): string {
  const seen = new Set<unknown>()
  const parts: string[] = []
  let current = error
  while (!seen.has(current)) {
    seen.add(current)
    if (!(current instanceof Error)) {
      parts.push(String(current))
      break
    }
    parts.push(current.message)
    if (current.cause === undefined) break
    current = current.cause
  }
  return parts.join(': ')
}
