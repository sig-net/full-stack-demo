/**
 * One local storage key read and written as a whole. Where storage is unavailable (private mode,
 * blocked site data, server rendering) a read is empty and a write is dropped, so the value then
 * lives for the page only.
 */
export interface LocalStorageSlot {
  readonly read: () => string | null
  readonly write: (value: string) => void
  readonly clear: () => void
  /** Notifies the listener when another tab changes the key or clears the store. */
  readonly subscribe: (listener: () => void) => () => void
}

export function localStorageSlot(key: string): LocalStorageSlot {
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
    },
    clear: () => {
      try {
        localStorage.removeItem(key)
      } catch {
        // Nothing was stored where storage is unavailable.
      }
    },
    subscribe: (listener) => {
      const onStorage = (event: StorageEvent): void => {
        if (event.key === null || event.key === key) listener()
      }
      window.addEventListener('storage', onStorage)
      return () => {
        window.removeEventListener('storage', onStorage)
      }
    },
  }
}
