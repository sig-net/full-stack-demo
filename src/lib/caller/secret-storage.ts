import { localStorageSlot, type LocalStorageSlot } from '@/lib/local-storage-slot'

/** The last caller secret set, kept across page reloads until it is cleared. */
export const callerSecretStorage: LocalStorageSlot = localStorageSlot('caller-secret')
