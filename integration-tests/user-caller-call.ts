import { bytesToHex, hexToBytes } from '@sig-net/midnight'
import { pureCircuits } from '@sig-net/midnight-examples-erc20-vault-contract'

import type { CompletionInputs } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'

import type { UserWallet } from './user-wallet'

/**
 * A caller call as the browser plays it: built and proved through the backend's own builder,
 * then balanced with the user wallet's coins and DUST fee, signed and finalised, with how long
 * each took.
 */
export interface FinalizedCallerCall {
  readonly finalizedTx: string
  readonly buildMs: number
  readonly finalizeMs: number
}

/** Times `build` and the user wallet's finalisation of what it built. */
export async function finalizeAsUser(
  user: UserWallet,
  build: () => Promise<string>,
): Promise<FinalizedCallerCall> {
  const building = Date.now()
  const unboundTx = await build()
  const finalizing = Date.now()
  const finalizedTx = await user.finalize(unboundTx)
  return { finalizedTx, buildMs: finalizing - building, finalizeMs: Date.now() - finalizing }
}

/** Mirrors `completionOutput` in `vault-request-attestation.ts`: an integration test imports nothing from `src` at runtime but `getBackend()`. */
export function completionOutput(inputs: CompletionInputs, outputWidth: number): Uint8Array {
  return inputs.attestationOutputKind === 'executed'
    ? hexToBytes(inputs.attestationOutput)
    : new Uint8Array(outputWidth)
}

/** The witness bytes of a vault secret in hex, as the browser derives them from the same secret. */
export function secretKeyOf(vaultSecret: string): Uint8Array {
  return hexToBytes(vaultSecret.replace(/^0x/i, ''))
}

/** Mirrors `userCommitmentOf` in `vault-secret.ts`: the commitment the server derives the deposit account from. */
export function userCommitmentOf(vaultSecret: string): string {
  return bytesToHex(pureCircuits.userCommitment(secretKeyOf(vaultSecret)))
}
