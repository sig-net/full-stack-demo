import 'server-only'

import type { VaultCircuitId } from '@sig-net/midnight-examples-erc20-vault-contract'

import type { inspectBoundTransaction } from '@/lib/midnight/transaction-v1/inspect-bound-transaction'

/**
 * Refuses bound bytes the relayer must not pay the fee of: anything but exactly one call to the
 * vault at the circuit the action commits, carrying only the coin movement that circuit's policy
 * admits. The policy cannot tell the coin a circuit surrenders from extra shielded movement bound
 * beside it, since the shielded offer is opaque to the inspector.
 */
export class SponsoredCallGuard {
  private readonly vaultAddress: string
  private readonly inspect: typeof inspectBoundTransaction

  /** `vaultAddress` is the address as the ledger renders a call's: lower-case hex without a prefix. */
  constructor(vaultAddress: string, inspect: typeof inspectBoundTransaction) {
    this.vaultAddress = vaultAddress
    this.inspect = inspect
  }

  /** Throws `SponsoredCallMismatch` unless the bytes are the one call at `circuit` under its policy. */
  assertSponsoredCall(boundTx: string, circuit: SponsoredCircuit): void {
    const policy = SPONSORED_CALL_POLICY_BY_CIRCUIT[circuit]
    const contents = this.inspect(boundTx)
    const [action] = contents?.actions ?? []
    if (
      contents === undefined ||
      contents.actions.length !== 1 ||
      action?.kind !== 'call' ||
      action.address !== this.vaultAddress ||
      action.entryPoint !== circuit ||
      contents.unshieldedOffers > 0 ||
      contents.dustActions ||
      (!policy.shieldedSpend && (contents.shieldedInputs > 0 || contents.shieldedTransients > 0))
    ) {
      throw new SponsoredCallMismatch(circuit)
    }
  }
}

/** The bound bytes are not the one vault call the action commits under its circuit's coin policy, so the relayer would pay the fee of something else. */
export class SponsoredCallMismatch extends Error {
  readonly name = 'SponsoredCallMismatch'

  constructor(circuit: SponsoredCircuit) {
    super(
      `the bound bytes must be exactly one ${circuit} call to the vault, ${SPONSORED_CALL_POLICY_BY_CIRCUIT[circuit].shieldedSpend ? 'spending shielded coins alone' : 'spending no coins'}`,
    )
  }
}

/** What a sponsored circuit's bound bytes may carry beside the call: an unshielded offer or a DUST action never, and the caller's shielded inputs (and the transient and change they leave) only for a circuit that takes a coin the wallet funds. */
export interface SponsoredCallPolicy {
  readonly shieldedSpend: boolean
}

/** The caller circuits the browser builds and the relayer pays for, each with what its bound bytes may spend. */
export const SPONSORED_CALL_POLICY_BY_CIRCUIT = {
  startDeposit: { shieldedSpend: false },
  completeDeposit: { shieldedSpend: false },
  /** Surrenders a fresh coin of the sent token, which the caller's wallet funds from its own coins. */
  startWithdraw: { shieldedSpend: true },
  completeWithdraw: { shieldedSpend: false },
} as const satisfies Partial<Record<VaultCircuitId, SponsoredCallPolicy>>

export type SponsoredCircuit = keyof typeof SPONSORED_CALL_POLICY_BY_CIRCUIT
