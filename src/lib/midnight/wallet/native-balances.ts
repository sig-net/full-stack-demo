import { nativeToken } from '@midnightntwrk/ledger-v9'

import type { Wallet } from '@/lib/midnight/wallet/wallet'

/** The wallet's holdings of Midnight's own two assets, in ledger units. */
export interface NativeBalances {
  /** Spendable unshielded NIGHT, in STAR. */
  readonly availableNight: bigint
  /** Unshielded NIGHT in coins an in-flight transaction spends, in STAR. */
  readonly pendingNight: bigint
  /** Spendable DUST now, in SPECK. */
  readonly dust: bigint
  /** Available NIGHT not registered for DUST generation, in STAR, or null when the wallet cannot observe registration. */
  readonly unregisteredNight: bigint | null
}

/** One whole NIGHT is ten to this power STAR. */
export const NIGHT_DECIMALS = 6

/** NIGHT is the unshielded balance under the ledger's native token type, zero when the wallet lists none. */
export async function readNativeBalances(wallet: Wallet): Promise<NativeBalances> {
  const [available, pending, dust, unregisteredNight] = await Promise.all([
    wallet.getAvailableUnshieldedBalances(),
    wallet.getPendingUnshieldedBalances(),
    wallet.getDustBalance(),
    wallet.getUnregisteredNightBalance?.() ?? null,
  ])
  return {
    availableNight: available[nativeToken().raw] ?? 0n,
    pendingNight: pending[nativeToken().raw] ?? 0n,
    dust,
    unregisteredNight,
  }
}
