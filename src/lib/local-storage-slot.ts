/**
 * One local storage key read and written as a whole. Where storage is unavailable (private mode,
 * blocked site data, server rendering) a read is empty and a write is dropped, so the value then
 * lives for the page only.
 */
export interface LocalStorageSlot {
  readonly read: () => string | null
  readonly write: (value: string) => void
  readonly clear: () => void
  /** Notifies the listener when this page writes or clears the key, when another tab changes it, or when another tab clears the store. */
  readonly subscribe: (listener: () => void) => () => void
}

export function localStorageSlot(key: string): LocalStorageSlot {
  // The `storage` event fires in every other tab, never the writing one, so this page's own writes notify here.
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of listeners) listener()
  }
  return {
    read: () => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    write: (value) => {
      try {
        localStorage.setItem(key, value)
      } catch {
        // Storage unavailable: the value lives for the page only.
      }
      notify()
    },
    clear: () => {
      try {
        localStorage.removeItem(key)
      } catch {
        // Nothing was stored where storage is unavailable.
      }
      notify()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      const onStorage = (event: StorageEvent): void => {
        if (event.key === null || event.key === key) listener()
      }
      window.addEventListener('storage', onStorage)
      return () => {
        listeners.delete(listener)
        window.removeEventListener('storage', onStorage)
      }
    },
  }
}
