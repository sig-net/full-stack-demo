import { MidnightNetwork } from '@sig-net/midnight'

import type { ClientConfig } from '@/lib/config/client-config'

/**
 * True for the local stack alone: an undeployed Midnight network with an EVM node on this
 * machine. The fork reports Sepolia's chain id, so the chain id cannot tell the two apart.
 */
export function isLocalEnvironment(
  config: Pick<ClientConfig, 'midnightNetwork' | 'ethereum'>,
): boolean {
  if (config.midnightNetwork.networkId !== MidnightNetwork.Undeployed) return false
  try {
    return LOOPBACK_HOSTS.has(new URL(config.ethereum.rpcURL).hostname)
  } catch {
    return false
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
