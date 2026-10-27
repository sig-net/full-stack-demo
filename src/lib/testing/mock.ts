/**
 * A test double for an interface: the methods the test supplies answer, and any other member
 * throws when called, so a dependency the test did not script cannot be used unnoticed.
 */
export function mock<T extends object>(name: string, methods: Partial<T> = {}): T {
  const handler: ProxyHandler<object> = {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) return Reflect.get(target, property, receiver)
      // `await`ing or returning a mock from an async function probes for a thenable.
      if (typeof property === 'symbol' || property === 'then') return undefined
      return () => {
        throw new Error(`${name}.${property} was called but the test did not expect it`)
      }
    },
  }
  // The proxy answers for every member the partial lacks, which is what makes it a whole T.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return new Proxy(methods, handler) as T
}
