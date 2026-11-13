import type { IconSource } from '@/lib/icon-source'

/** The token artwork exported from the design file into `public/token-icons`, by symbol. */
export const BUNDLED_TOKEN_ICONS = {
  BTC: { source: 'image', url: '/token-icons/btc.svg' },
  ETH: { source: 'image', url: '/token-icons/eth.svg' },
  SOL: { source: 'image', url: '/token-icons/sol.svg' },
} as const satisfies Record<string, IconSource>

/** The network badges exported from the design file into `public/network-icons`, by network. */
export const BUNDLED_NETWORK_ICONS = {
  bitcoin: { source: 'image', url: '/network-icons/bitcoin.svg' },
  ethereum: { source: 'image', url: '/network-icons/ethereum.svg' },
  solana: { source: 'image', url: '/network-icons/solana.svg' },
} as const satisfies Record<string, IconSource>
