import type { MidnightBalanceAmount } from '@/lib/balances/midnight-balances'
import type { TokenInfo } from '@/lib/tokens/token-info'
import type { TokenInfoRegistry } from '@/lib/tokens/token-info-registry'

/** A balance in a token the vault admits, with the registry entry that names it. */
export interface SupportedBalance {
  readonly token: TokenInfo
  readonly balance: MidnightBalanceAmount
}

/** The wallet's balances in tokens the vault admits, the ones a swap or a send can draw on. */
export function supportedBalancesOf(
  balances: readonly MidnightBalanceAmount[],
  registry: TokenInfoRegistry,
): SupportedBalance[] {
  return balances.flatMap((balance) => {
    const token = registry.get({ ledger: 'shielded', tokenType: balance.tokenType })
    return token !== undefined && token.supported ? [{ token, balance }] : []
  })
}
