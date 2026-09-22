import type { EthereumConfig } from '@/lib/config/ethereum-config'
import type { MidnightConfig } from '@/lib/config/midnight-config'

/** The configuration subset that is safe to send to the browser. */
export interface ClientConfig {
  readonly midnight: MidnightConfig
  readonly ethereum: EthereumConfig
}
