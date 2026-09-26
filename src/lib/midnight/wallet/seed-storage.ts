const SEED_STORAGE_KEY = 'midnight-wallet-seed'

/** The seed of the connected seed wallet, kept across page reloads until the wallet disconnects. */
export function readStoredSeed(): string | null {
  try {
    return localStorage.getItem(SEED_STORAGE_KEY)
  } catch {
    return null
  }
}

export function storeSeed(seed: string): void {
  try {
    localStorage.setItem(SEED_STORAGE_KEY, seed)
  } catch {
    // Storage unavailable (private mode, blocked site data): the session simply does not persist.
  }
}

export function clearStoredSeed(): void {
  try {
    localStorage.removeItem(SEED_STORAGE_KEY)
  } catch {
    // Nothing was stored where storage is unavailable.
  }
}

/** Notifies the listener when another tab changes the stored seed. */
export function subscribeToStoredSeed(listener: () => void): () => void {
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener('storage', listener)
  }
}
