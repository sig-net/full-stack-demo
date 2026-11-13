import { localStorageSlot, type LocalStorageSlot } from '@/lib/local-storage-slot'

/** The last vault secret set, kept across page reloads until it is cleared. */
export const vaultSecretStorage: LocalStorageSlot = localStorageSlot('vault-secret')
