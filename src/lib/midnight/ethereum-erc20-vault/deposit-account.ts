import { deriveEvmAddress } from '@sig-net/midnight'

import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'

/** The EVM account the MPC signs the caller's sweeps from, derived over the user commitment in hex, which the start circuit records as the request's path. */
export function depositAccountOf(
  userCommitment: string,
  signet: MidnightSignetConfig,
  vault: MidnightEthereumErc20VaultConfig,
): string {
  return deriveEvmAddress(
    signet.mpcRootPublicKey,
    vault.contractAddress,
    userCommitment,
  ).toLowerCase()
}
