import { type TokenId, tokenKey } from '@/lib/tokens/token-id'
import type { TokenInfo } from '@/lib/tokens/token-info'

/** The tokens the application knows, looked up by identity. An unknown token answers undefined. */
export class TokenInfoRegistry {
  private readonly byKey: ReadonlyMap<string, TokenInfo>

  constructor(infos: readonly TokenInfo[]) {
    const byKey = new Map<string, TokenInfo>()
    for (const info of infos) {
      const key = tokenKey(info.id)
      if (byKey.has(key)) throw new Error(`Token ${key} is registered twice.`)
      byKey.set(key, info)
    }
    this.byKey = byKey
  }

  get(id: TokenId): TokenInfo | undefined {
    return this.byKey.get(tokenKey(id))
  }
}
