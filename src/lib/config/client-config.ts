import type { EthereumConfig } from '@/lib/config/ethereum-config'
import type { MidnightNetworkConfig } from '@/lib/config/midnight-network-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'

/** The configuration subset that is safe to send to the browser. */
export interface ClientConfig {
  readonly midnightNetwork: MidnightNetworkConfig
  readonly midnightSignet: MidnightSignetConfig
  readonly midnightEthereumErc20Vault: MidnightEthereumErc20VaultConfig
  readonly ethereum: EthereumConfig
}
