import type { ClientConfig } from '@/lib/config/client-config'
import { isLocalEnvironment } from '@/lib/config/local-environment'

/** A block explorer for the configured Ethereum chain, named as its link reads. */
export interface EthereumExplorer {
  readonly name: string
  transactionURL(hash: string): string
  addressURL(address: string): string
}

/**
 * The explorer of the configured chain: Otterscan on the local stack, Etherscan on a chain it
 * serves, none otherwise. The local fork reports Sepolia's chain id, so the environment decides
 * before the chain does.
 */
export function ethereumExplorerOf(
  config: Pick<ClientConfig, 'midnightNetwork' | 'ethereum'>,
): EthereumExplorer | null {
  if (isLocalEnvironment(config)) return explorer('Otterscan', LOCAL_OTTERSCAN_URL)
  const etherscanURL = ETHERSCAN_URLS[config.ethereum.chainId]
  return etherscanURL === undefined ? null : explorer('Etherscan', etherscanURL)
}

/** Where compose.yaml publishes the otterscan service. */
export const LOCAL_OTTERSCAN_URL = 'http://localhost:5100'

/** Etherscan's site per chain id, for the chains the application can be configured with. */
export const ETHERSCAN_URLS: Readonly<Record<number, string>> = {
  1: 'https://etherscan.io',
  11155111: 'https://sepolia.etherscan.io',
}

/** Otterscan and Etherscan share the `/tx/{hash}` and `/address/{address}` paths. */
function explorer(name: string, baseURL: string): EthereumExplorer {
  return {
    name,
    transactionURL: (hash) => `${baseURL}/tx/${hash}`,
    addressURL: (address) => `${baseURL}/address/${address}`,
  }
}
