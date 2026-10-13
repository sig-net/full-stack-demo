import { type TokenId, tokenKey } from '@/lib/tokens/token-id'
import type { TokenInfo } from '@/lib/tokens/token-info'

/** The tokens the application knows, looked up by identity or by the ERC20 behind them. An unknown token answers undefined. */
export class TokenInfoRegistry {
  private readonly byKey: ReadonlyMap<string, TokenInfo>
  private readonly byErc20: ReadonlyMap<string, TokenInfo>
  /** Differs between two registries whose tokens or support differ, for a query key that must refetch when they do. */
  readonly fingerprint: string

  constructor(infos: readonly TokenInfo[]) {
    const byKey = new Map<string, TokenInfo>()
    const byErc20 = new Map<string, TokenInfo>()
    for (const info of infos) {
      const key = tokenKey(info.id)
      if (byKey.has(key)) throw new Error(`Token ${key} is registered twice.`)
      byKey.set(key, info)
      byErc20.set(info.origin.erc20Address.toLowerCase(), info)
    }
    this.byKey = byKey
    this.byErc20 = byErc20
    this.fingerprint = infos
      .map((info) => `${tokenKey(info.id)}${info.supported ? '+' : '-'}`)
      .join(',')
  }

  get(id: TokenId): TokenInfo | undefined {
    return this.byKey.get(tokenKey(id))
  }

  byErc20Address(erc20Address: string): TokenInfo | undefined {
    return this.byErc20.get(erc20Address.toLowerCase())
  }

  /** The tokens the vault's allowlist admits. */
  supported(): TokenInfo[] {
    return [...this.byKey.values()].filter((info) => info.supported)
  }
}
