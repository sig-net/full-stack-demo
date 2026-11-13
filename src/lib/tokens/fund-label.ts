import { abbreviateHex } from '@/lib/abbreviate-hex'
import type { DepositAccountFund } from '@/lib/midnight/ethereum-erc20-vault/supported-token-v1/deposit-account-fund'
import type { TokenInfoRegistry } from '@/lib/tokens/token-info-registry'

/**
 * The fund's token symbol, qualified by its issuer when another fund shares the symbol: the vault
 * admits more than one contract called USDC. A token the registry does not know shows its address.
 */
export function fundLabel(
  fund: DepositAccountFund,
  funds: readonly DepositAccountFund[],
  registry: TokenInfoRegistry,
): string {
  const info = registry.byErc20Address(fund.erc20Address)
  if (info === undefined) return abbreviateHex(fund.erc20Address)
  const shared = funds.some(
    (other) =>
      other.erc20Address !== fund.erc20Address &&
      registry.byErc20Address(other.erc20Address)?.symbol === info.symbol,
  )
  if (!shared) return info.symbol
  return `${info.symbol} (${info.origin.issuer ?? abbreviateHex(fund.erc20Address)})`
}
