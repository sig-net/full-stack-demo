/**
 * Builds a value on first call and shares it with every later call. A failed build is dropped, so
 * the next call tries again.
 */
export function lazySingleton<T>(create: () => Promise<T>): () => Promise<T> {
  let instance: Promise<T> | undefined
  return () => {
    instance ??= create().catch((error: unknown) => {
      instance = undefined
      throw error
    })
    return instance
  }
}
