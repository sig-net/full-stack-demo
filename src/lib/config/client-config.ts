import type { EthereumConfig } from '@/lib/config/ethereum-config'
import type { MidnightNetworkConfig } from '@/lib/config/midnight-network-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { MidnightVaultConfig } from '@/lib/config/midnight-vault-config'

/** The configuration subset that is safe to send to the browser. */
export interface ClientConfig {
  readonly midnightNetwork: MidnightNetworkConfig
  readonly midnightSignet: MidnightSignetConfig
  readonly midnightVault: MidnightVaultConfig
  readonly ethereum: EthereumConfig
}
