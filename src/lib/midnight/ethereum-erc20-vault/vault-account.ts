import { deriveVaultEvmAddress } from '@sig-net/midnight-examples-erc20-vault-contract'

import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'

/** The EVM account the MPC signs the vault's own transactions from, as a lower-case `0x` address. */
export function vaultAccountOf(
  signet: MidnightSignetConfig,
  vault: MidnightEthereumErc20VaultConfig,
): string {
  return deriveVaultEvmAddress(signet.mpcRootPublicKey, vault.contractAddress).toLowerCase()
}
