import {
  type ContractAddress,
  type RawTokenType,
  rawTokenType,
} from '@midnight-ntwrk/compact-runtime'
import {
  AAVE_USDC,
  CHAINLINK_LINK,
  CIRCLE_EURC,
  CIRCLE_USDC,
  evmAddressBytes,
  pureCircuits,
  SEPOLIA_CHAIN_ID,
  STATA_USDC,
  WETH9,
} from '@sig-net/midnight-examples-erc20-vault-contract'

import { LOCAL_CHAIN_ID } from '@/lib/config/ethereum-config'
import { type IconSource, NO_ICON } from '@/lib/icon-source'
import type { PriceRequest } from '@/lib/pricing/spot-price'
import type { SupportedToken } from '@/lib/midnight/ethereum-erc20-vault/supported-token-v1/supported-token'
import type { TokenInfo } from '@/lib/tokens/token-info'

/**
 * The vault's tokens on `chainId`: the allowlist the ledger reports, each with the artwork and
 * naming of the bundled table when it lists the ERC20, plus the bundled tokens the allowlist does
 * not admit, marked unsupported. A supported token's decimals are its contract's own, since the
 * chain is authoritative; a bundled token the allowlist omits keeps the table's. A bundled token
 * is valued as the mainnet asset it stands for, whichever test chain it lives on; a token the
 * table does not list is unpriced.
 */
export function vaultTokenInfos(
  vaultContractAddress: ContractAddress,
  chainId: number,
  supportedTokens: readonly SupportedToken[] = [],
): TokenInfo[] {
  const supportedByAddress = new Map(
    supportedTokens.map((token) => [token.erc20Address.toLowerCase(), token]),
  )
  const bundled = VAULT_ERC20_TOKENS_BY_CHAIN[chainId] ?? []
  const bundledAddresses = new Set(bundled.map((token) => token.erc20Address.toLowerCase()))
  const info = (
    token: Omit<VaultErc20Token, 'issuer' | 'pricing'> &
      Partial<Pick<VaultErc20Token, 'issuer' | 'pricing'>>,
    supported: boolean,
  ): TokenInfo => ({
    id: { ledger: 'shielded', tokenType: vaultTokenType(token.erc20Address, vaultContractAddress) },
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    icon: token.icon,
    origin: {
      kind: 'ethereum-erc20-vault',
      chainId,
      erc20Address: token.erc20Address,
      issuer: token.issuer,
    },
    supported,
    pricing: token.pricing ?? null,
  })
  return [
    ...bundled.map((token) => {
      const supported = supportedByAddress.get(token.erc20Address.toLowerCase())
      return info(
        supported === undefined ? token : { ...token, decimals: supported.decimals },
        supported !== undefined,
      )
    }),
    ...supportedTokens
      .filter((token) => !bundledAddresses.has(token.erc20Address.toLowerCase()))
      .map((token) => info({ ...token, icon: NO_ICON }, true)),
  ]
}

/** The shielded token type the vault at `vaultContractAddress` mints for an ERC20. */
export function vaultTokenType(
  erc20Address: string,
  vaultContractAddress: ContractAddress,
): RawTokenType {
  return rawTokenType(
    pureCircuits.vaultTokenDomainSeparator(evmAddressBytes(erc20Address)),
    vaultContractAddress,
  )
}

interface VaultErc20Token {
  readonly erc20Address: string
  readonly symbol: string
  readonly name: string
  /** The ERC20's own `decimals()`: the vault mints its base-unit amount one to one. */
  readonly decimals: number
  readonly issuer: string
  readonly icon: IconSource
  readonly pricing: PriceRequest
}

const USDC_ICON: IconSource = { source: 'web3icons', name: 'USDC' }

const USDC_PRICING: PriceRequest = { kind: 'coin', coinId: 'usd-coin' }

const SEPOLIA_VAULT_ERC20_TOKENS: readonly VaultErc20Token[] = [
  {
    erc20Address: CIRCLE_USDC,
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    issuer: 'Circle',
    icon: USDC_ICON,
    pricing: USDC_PRICING,
  },
  {
    erc20Address: CIRCLE_EURC,
    symbol: 'EURC',
    name: 'Euro Coin',
    decimals: 6,
    issuer: 'Circle',
    icon: { source: 'web3icons', name: 'EURC' },
    pricing: { kind: 'coin', coinId: 'euro-coin' },
  },
  {
    erc20Address: WETH9,
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    issuer: 'WETH9',
    icon: { source: 'web3icons', name: 'ETH' },
    pricing: { kind: 'coin', coinId: 'weth' },
  },
  {
    erc20Address: CHAINLINK_LINK,
    symbol: 'LINK',
    name: 'ChainLink Token',
    decimals: 18,
    issuer: 'Chainlink',
    icon: { source: 'web3icons', name: 'LINK' },
    pricing: { kind: 'coin', coinId: 'chainlink' },
  },
  {
    erc20Address: AAVE_USDC,
    symbol: 'USDC',
    name: 'USDC (Aave test token)',
    decimals: 6,
    issuer: 'Aave',
    icon: USDC_ICON,
    pricing: USDC_PRICING,
  },
  {
    erc20Address: STATA_USDC,
    symbol: 'stataEthUSDC',
    name: 'Static Aave Ethereum USDC',
    decimals: 6,
    issuer: 'Aave',
    icon: NO_ICON,
    pricing: {
      kind: 'erc4626Share',
      wrapperErc20Address: STATA_USDC.toLowerCase(),
      underlyingCoinId: USDC_PRICING.coinId,
    },
  },
]

// The local chain forks Sepolia, so the same contracts live at the same addresses.
const VAULT_ERC20_TOKENS_BY_CHAIN: Readonly<Record<number, readonly VaultErc20Token[]>> = {
  [Number(SEPOLIA_CHAIN_ID)]: SEPOLIA_VAULT_ERC20_TOKENS,
  [LOCAL_CHAIN_ID]: SEPOLIA_VAULT_ERC20_TOKENS,
}
