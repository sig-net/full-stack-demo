import { localStorageSlot, type LocalStorageSlot } from '@/lib/local-storage-slot'

/** The seed of the connected seed wallet, kept across page reloads until the wallet disconnects. */
export const seedStorage: LocalStorageSlot = localStorageSlot('midnight-wallet-seed')
