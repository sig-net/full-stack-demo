import { bytesToHex, deriveEvmAddress } from '@sig-net/midnight'
import { pureCircuits } from '@sig-net/midnight-examples-erc20-vault-contract'

import type { Caller } from '@/lib/caller/caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'

/** The EVM account the MPC signs the caller's sweeps from, derived over the caller's commitment, which the start circuit records as the request's path. */
export function depositAccountOf(
  caller: Pick<Caller, 'secretKey'>,
  signet: MidnightSignetConfig,
  vault: MidnightEthereumErc20VaultConfig,
): string {
  return deriveEvmAddress(
    signet.mpcRootPublicKey,
    vault.contractAddress,
    bytesToHex(pureCircuits.userCommitment(caller.secretKey)),
  ).toLowerCase()
}
