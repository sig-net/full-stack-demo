import { hexToBytes } from '@sig-net/midnight'

import type { CompletionInputs } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'

import type { UserWallet } from './user-wallet'

/**
 * A caller call as the browser plays it: built and proved through the backend's own builder,
 * then balanced, signed and bound by the user wallet without a fee, with how long each took.
 */
export interface BoundCallerCall {
  readonly boundTx: string
  readonly buildMs: number
  readonly bindMs: number
}

/** Times `build` and the user wallet's fee-less bind of what it built. */
export async function bindAsUser(
  user: UserWallet,
  build: () => Promise<string>,
): Promise<BoundCallerCall> {
  const building = Date.now()
  const unboundTx = await build()
  const binding = Date.now()
  const boundTx = await user.balanceWithoutFee(unboundTx)
  return { boundTx, buildMs: binding - building, bindMs: Date.now() - binding }
}

/** Mirrors `completionOutput` in `vault-request-attestation.ts`: an integration test imports nothing from `src` at runtime but `getBackend()`. */
export function completionOutput(inputs: CompletionInputs, outputWidth: number): Uint8Array {
  return inputs.attestationOutputKind === 'executed'
    ? hexToBytes(inputs.attestationOutput)
    : new Uint8Array(outputWidth)
}

/** The witness bytes of a caller secret in hex, as the server derives them from the same secret. */
export function secretKeyOf(callerSecret: string): Uint8Array {
  return hexToBytes(callerSecret.replace(/^0x/i, ''))
}
