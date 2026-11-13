import { nativeToken } from '@midnightntwrk/ledger-v9'

import type { Wallet } from '@/lib/midnight/wallet/wallet'

/** The wallet's holdings of Midnight's own two assets, in ledger units. */
export interface NativeBalances {
  /** Unshielded NIGHT, in STAR. */
  readonly night: bigint
  /** DUST now, in SPECK. */
  readonly dust: bigint
}

/** One whole NIGHT is ten to this power STAR. */
export const NIGHT_DECIMALS = 6

/** NIGHT is the unshielded balance under the ledger's native token type, zero when the wallet lists none. */
export async function readNativeBalances(wallet: Wallet): Promise<NativeBalances> {
  const [unshielded, dust] = await Promise.all([
    wallet.getUnshieldedBalances(),
    wallet.getDustBalance(),
  ])
  return { night: unshielded[nativeToken().raw] ?? 0n, dust: dust.balance }
}
