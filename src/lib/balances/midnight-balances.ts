import type { AssetAmount } from '@/lib/asset-amount'
import type { Wallet } from '@/lib/midnight/wallet/wallet'

/** A balance with the token type that identifies it, since several token types share a symbol. */
export interface MidnightBalanceAmount extends AssetAmount {
  readonly tokenType: string
}

/**
 * Reads the shielded and the unshielded balances of the connected wallet, shielded first, each
 * ledger ordered by token type. Amounts are base units written in full and every value is $0.00,
 * since the decimals, the symbol and the price of a Midnight token are not known yet: the symbol
 * is the first four characters of the token type hex.
 */
export async function readMidnightBalanceAmounts(wallet: Wallet): Promise<MidnightBalanceAmount[]> {
  const [shielded, unshielded] = await Promise.all([
    wallet.getShieldedBalances(),
    wallet.getUnshieldedBalances(),
  ])
  return [
    ...amountsOf(MIDNIGHT_SHIELDED_NETWORK_NAME, shielded),
    ...amountsOf(MIDNIGHT_UNSHIELDED_NETWORK_NAME, unshielded),
  ]
}

export const MIDNIGHT_SHIELDED_NETWORK_NAME = 'Midnight shielded'
export const MIDNIGHT_UNSHIELDED_NETWORK_NAME = 'Midnight unshielded'

const TOKEN_CODE_LENGTH = 4

function amountsOf(networkName: string, balances: Record<string, bigint>): MidnightBalanceAmount[] {
  return Object.entries(balances)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tokenType, amount]) => ({
      tokenType,
      assetSymbol: tokenType.slice(0, TOKEN_CODE_LENGTH),
      networkName,
      amount: amount.toString(),
      usdValue: '0.00',
    }))
}
