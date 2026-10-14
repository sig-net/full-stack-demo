import type { AssetAmount } from '@/lib/asset-amount'
import { NO_ICON } from '@/lib/icon-source'
import type { Wallet } from '@/lib/midnight/wallet/wallet'
import { formatTokenAmount } from '@/lib/tokens/format-token-amount'
import { ORIGIN_NETWORKS } from '@/lib/tokens/token-info'
import type { TokenInfoRegistry } from '@/lib/tokens/token-info-registry'

/** A balance with the token type that identifies it, since several token types share a symbol, and its exact base units. */
export interface MidnightBalanceAmount extends AssetAmount {
  readonly tokenType: string
  readonly baseUnits: bigint
}

/**
 * Reads the connected wallet's shielded balances, ordered by token type. A registered token shows
 * its symbol, its amount in whole tokens and the chain it came from. An unregistered one shows the
 * first four characters of its token type, its amount in base units and Midnight as its network.
 * Every value is $0.00 until a price source exists.
 */
export async function readMidnightBalanceAmounts(
  wallet: Wallet,
  registry: TokenInfoRegistry,
): Promise<MidnightBalanceAmount[]> {
  const balances = await wallet.getShieldedBalances()
  return Object.entries(balances)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tokenType, amount]) => {
      const info = registry.get({ ledger: 'shielded', tokenType })
      if (info === undefined) {
        return {
          tokenType,
          baseUnits: amount,
          assetSymbol: tokenType.slice(0, UNREGISTERED_TOKEN_CODE_LENGTH),
          networkName: MIDNIGHT_NETWORK_NAME,
          amount: amount.toString(),
          usdValue: '0.00',
          icon: NO_ICON,
          networkIcon: NO_ICON,
        }
      }
      const network = ORIGIN_NETWORKS[info.origin.kind]
      return {
        tokenType,
        baseUnits: amount,
        assetSymbol: info.symbol,
        networkName: network.name,
        amount: formatTokenAmount(amount, info.decimals),
        usdValue: '0.00',
        icon: info.icon,
        networkIcon: network.icon,
      }
    })
}

export const MIDNIGHT_NETWORK_NAME = 'Midnight'

const UNREGISTERED_TOKEN_CODE_LENGTH = 4
