import type { SupportedBalance } from '@/lib/balances/supported-balances'
import { formatTokenAmount } from '@/lib/tokens/format-token-amount'
import { parseTokenAmount } from '@/lib/tokens/parse-token-amount'

/**
 * The typed principal in base units, or why the balance cannot surrender it with the vault's
 * `fee` on top. A null fee is one the page has not read, so no amount is accepted until it has.
 */
export function surrenderAmountOf(
  text: string,
  source: SupportedBalance | null,
  fee: bigint | null,
): SurrenderAmount {
  if (source === null || text === '') return { value: null, error: null }
  const { token, balance } = source
  try {
    const value = parseTokenAmount(text, token.decimals)
    if (value <= 0n) return { value: null, error: null }
    if (fee === null) {
      return { value: null, error: `The vault's fee for ${token.symbol} has not been read yet.` }
    }
    if (value + fee > balance.baseUnits) {
      const held = `${formatTokenAmount(balance.baseUnits, token.decimals)} ${token.symbol}`
      return {
        value: null,
        error:
          fee === 0n
            ? `That is more than your ${held}.`
            : `That plus the ${formatTokenAmount(fee, token.decimals)} ${token.symbol} vault fee is more than your ${held}.`,
      }
    }
    return { value, error: null }
  } catch (error: unknown) {
    return { value: null, error: error instanceof Error ? error.message : String(error) }
  }
}

export interface SurrenderAmount {
  readonly value: bigint | null
  readonly error: string | null
}

/** The largest principal the balance surrenders with `fee` on top, in whole tokens, zero when the fee alone exceeds it and the whole balance while the fee is unread. */
export function maxSurrenderAmount(source: SupportedBalance, fee: bigint | null): string {
  const { token, balance } = source
  const spendable = fee === null ? balance.baseUnits : balance.baseUnits - fee
  return formatTokenAmount(spendable > 0n ? spendable : 0n, token.decimals)
}

/** The fee line a surrendering action shows under its amount, in the token's units. */
export function vaultFeeNotice(fee: bigint | null, symbol: string, decimals: number): string {
  return fee === null
    ? `Reading the vault fee for ${symbol}…`
    : `Vault fee: ${formatTokenAmount(fee, decimals)} ${symbol}, taken on top of the amount.`
}
