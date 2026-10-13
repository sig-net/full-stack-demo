import type { IconSource } from '@/lib/icon-source'
import { BUNDLED_NETWORK_ICONS } from '@/lib/tokens/bundled-icons'
import type { TokenId } from '@/lib/tokens/token-id'

/** What the UI needs to render a token: identity, symbol, name, display decimals, icon and origin. */
export interface TokenInfo {
  readonly id: TokenId
  readonly symbol: string
  readonly name: string
  /** The number of base units in a whole token is ten to this power. */
  readonly decimals: number
  readonly icon: IconSource
  readonly origin: TokenOrigin
}

/** The chain a token came from, which the badge on its icon shows. */
export interface EthereumErc20VaultTokenOrigin {
  readonly kind: 'ethereum-erc20-vault'
  readonly chainId: number
  readonly erc20Address: string
  readonly issuer: string
}

export type TokenOrigin = EthereumErc20VaultTokenOrigin

export interface OriginNetwork {
  readonly name: string
  readonly icon: IconSource
}

/** The network each origin kind shows on the icon badge. */
export const ORIGIN_NETWORKS: Readonly<Record<TokenOrigin['kind'], OriginNetwork>> = {
  'ethereum-erc20-vault': { name: 'Ethereum', icon: BUNDLED_NETWORK_ICONS.ethereum },
}
