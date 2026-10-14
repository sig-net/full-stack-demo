import type { ClientConfig } from '@/lib/config/client-config'
import { isLocalEnvironment } from '@/lib/config/local-environment'

/** A block explorer for the configured Midnight network, named as its link reads. */
export interface MidnightExplorer {
  readonly name: string
  /** The page of the block at `height`, where a Midnight transaction is found among the block's extrinsics. */
  blockURL(height: number): string
}

/**
 * Polkadot.js Apps over the configured node: the copy compose.yaml serves on the local stack,
 * the public site elsewhere. Apps finds a block by height, never a Midnight transaction by its
 * id, so a transaction links to its block.
 */
export function midnightExplorerOf(
  config: Pick<ClientConfig, 'midnightNetwork' | 'ethereum'>,
): MidnightExplorer {
  const appsURL = isLocalEnvironment(config) ? LOCAL_POLKADOT_JS_APPS_URL : POLKADOT_JS_APPS_URL
  const rpc = encodeURIComponent(config.midnightNetwork.nodeURL.replace(/^http/, 'ws'))
  return {
    name: 'Polkadot.js Apps',
    blockURL: (height) => `${appsURL}/?rpc=${rpc}#/explorer/query/${height.toString()}`,
  }
}

/** Where compose.yaml publishes the polkadot-js-apps service. */
export const LOCAL_POLKADOT_JS_APPS_URL = 'http://localhost:5300'

export const POLKADOT_JS_APPS_URL = 'https://polkadot.js.org/apps'
