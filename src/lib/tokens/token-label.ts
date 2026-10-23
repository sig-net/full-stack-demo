import type { TokenInfo } from '@/lib/tokens/token-info'

/** The symbol, qualified by the issuer where the vault admits more than one token of that symbol. */
export function tokenLabel(token: TokenInfo): string {
  return token.origin.issuer === undefined
    ? token.symbol
    : `${token.symbol} (${token.origin.issuer})`
}
