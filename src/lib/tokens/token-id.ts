import type { RawTokenType } from '@midnight-ntwrk/compact-runtime'

/** The ledger gives the shielded and the unshielded native token the same raw hex, so a token is identified by both. */
export interface TokenId {
  readonly ledger: TokenLedger
  readonly tokenType: RawTokenType
}

export const TOKEN_LEDGERS = ['shielded', 'unshielded'] as const

export type TokenLedger = (typeof TOKEN_LEDGERS)[number]

export function tokenKey({ ledger, tokenType }: TokenId): string {
  return `${ledger}:${tokenType}`
}
