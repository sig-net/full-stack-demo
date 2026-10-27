import type { ClientConfig } from '@/lib/config/client-config'
import { isLocalEnvironment } from '@/lib/config/local-environment'

/** The sig.network explorer, named as its link reads. */
export interface SignetExplorer {
  readonly name: string
  /** The page of the Sig Network request's lifecycle, on the configured Midnight network. */
  requestURL(requestId: string): string
}

/**
 * The copy compose.yaml serves on the local stack, configured with the stack's own Signet
 * contract, the published site elsewhere. The network travels in the URL, so the page opens on
 * the one the request lives on.
 */
export function signetExplorerOf(
  config: Pick<ClientConfig, 'midnightNetwork' | 'ethereum'>,
): SignetExplorer {
  const explorerURL = isLocalEnvironment(config) ? LOCAL_SIGNET_EXPLORER_URL : SIGNET_EXPLORER_URL
  const networkId = encodeURIComponent(config.midnightNetwork.networkId)
  return {
    name: 'the Sig Network explorer',
    requestURL: (requestId) =>
      `${explorerURL}/midnight/explorer?networkId=${networkId}&requestId=${encodeURIComponent(requestId)}`,
  }
}

/** Where compose.yaml publishes the signet-explorer service. */
export const LOCAL_SIGNET_EXPLORER_URL = 'http://localhost:5400'

export const SIGNET_EXPLORER_URL = 'https://sig-net.github.io/explorer'
