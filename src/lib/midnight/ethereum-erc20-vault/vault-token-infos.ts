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
import type { TokenInfo } from '@/lib/tokens/token-info'

/** The vault's tokens on `chainId`: one shielded token per ERC20 it handles there, none on a chain it does not serve. */
export function vaultTokenInfos(
  vaultContractAddress: ContractAddress,
  chainId: number,
): TokenInfo[] {
  return (VAULT_ERC20_TOKENS_BY_CHAIN[chainId] ?? []).map((token) => ({
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
  }))
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
}

const USDC_ICON: IconSource = { source: 'web3icons', name: 'USDC' }

const SEPOLIA_VAULT_ERC20_TOKENS: readonly VaultErc20Token[] = [
  {
    erc20Address: CIRCLE_USDC,
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    issuer: 'Circle',
    icon: USDC_ICON,
  },
  {
    erc20Address: CIRCLE_EURC,
    symbol: 'EURC',
    name: 'Euro Coin',
    decimals: 6,
    issuer: 'Circle',
    icon: { source: 'web3icons', name: 'EURC' },
  },
  {
    erc20Address: WETH9,
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    issuer: 'WETH9',
    icon: { source: 'web3icons', name: 'ETH' },
  },
  {
    erc20Address: CHAINLINK_LINK,
    symbol: 'LINK',
    name: 'ChainLink Token',
    decimals: 18,
    issuer: 'Chainlink',
    icon: { source: 'web3icons', name: 'LINK' },
  },
  {
    erc20Address: AAVE_USDC,
    symbol: 'USDC',
    name: 'USDC (Aave test token)',
    decimals: 6,
    issuer: 'Aave',
    icon: USDC_ICON,
  },
  {
    erc20Address: STATA_USDC,
    symbol: 'stataEthUSDC',
    name: 'Static Aave Ethereum USDC',
    decimals: 6,
    issuer: 'Aave',
    icon: NO_ICON,
  },
]

// The local chain forks Sepolia, so the same contracts live at the same addresses.
const VAULT_ERC20_TOKENS_BY_CHAIN: Readonly<Record<number, readonly VaultErc20Token[]>> = {
  [Number(SEPOLIA_CHAIN_ID)]: SEPOLIA_VAULT_ERC20_TOKENS,
  [LOCAL_CHAIN_ID]: SEPOLIA_VAULT_ERC20_TOKENS,
}
