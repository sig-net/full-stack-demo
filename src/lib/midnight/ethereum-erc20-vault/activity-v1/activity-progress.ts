import type {
  Activity,
  ActivityTransaction,
  ActivityWalletTransaction,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import type { DepositState } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import type { VaultRequestState } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'

/**
 * What the caller must do next for an activity, read from its row alone: balance a proved call
 * with the wallet, start the completion, or nothing while the backend works.
 */
export type ActivityAction =
  | { readonly kind: 'balance'; readonly transaction: ActivityWalletTransaction }
  | { readonly kind: 'complete' }
  | { readonly kind: 'none' }

export function activityActionOf(activity: Activity): ActivityAction {
  if (activity.walletTransaction !== null) {
    return { kind: 'balance', transaction: activity.walletTransaction }
  }
  if (activity.depositState === 'AwaitingCompletion') return { kind: 'complete' }
  return { kind: 'none' }
}

/** One step of an activity's flow, in order, with where the activity stands against it. */
export interface ActivityStep {
  readonly label: string
  readonly status: ActivityStepStatus
}

export type ActivityStepStatus = 'done' | 'current' | 'pending' | 'failed'

/** The deposit's steps in order; a second activity type brings its own list. */
export const DEPOSIT_STEPS = [
  'Start call signed by your wallet',
  'Start call included on Midnight',
  'Request flushed to the vault queue',
  'Request sent to the MPC',
  'Sweep signed by the MPC',
  'Funds swept on Ethereum',
  'Sweep attested by the MPC',
  'Attestation flushed to the vault',
  'Completion signed by your wallet',
  'Completion included on Midnight',
] as const

export function activityStepsOf(activity: Activity): ActivityStep[] {
  const { current, failed } = depositProgress(activity)
  return DEPOSIT_STEPS.map((label, index) => ({
    label,
    status: index < current ? 'done' : index > current ? 'pending' : failed ? 'failed' : 'current',
  }))
}

/** The index of the step the deposit stands at, `DEPOSIT_STEPS.length` once every step is done. */
function depositProgress(activity: Activity): { current: number; failed: boolean } {
  return DEPOSIT_PROGRESS_BY_STATE[activity.depositState](activity)
}

const DEPOSIT_PROGRESS_BY_STATE: Record<
  DepositState,
  (activity: Activity) => { current: number; failed: boolean }
> = {
  AwaitingStartTransaction: (activity) => ({
    current: signingStep(activity.startTransaction, 0),
    failed: false,
  }),
  AwaitingVaultRequest: (activity) => ({
    current:
      activity.vaultRequestState === null ? 2 : VAULT_REQUEST_STEPS[activity.vaultRequestState],
    failed: activity.foreignChainTransaction?.state === 'Failed',
  }),
  AwaitingCompletion: () => ({ current: 8, failed: false }),
  AwaitingCompleteTransaction: (activity) => ({
    current: signingStep(activity.completeTransaction, 8),
    failed: false,
  }),
  Completed: () => ({ current: DEPOSIT_STEPS.length, failed: false }),
  Failed: (activity) => ({
    current: activity.startTransaction?.hash === null ? 0 : 1,
    failed: true,
  }),
}

/** A call stands at its signing step until the wallet hands it back, then at its inclusion step. */
function signingStep(transaction: ActivityTransaction | null, signing: number): number {
  return transaction === null ||
    transaction.lifecycleState === 'AwaitingProof' ||
    transaction.lifecycleState === 'AwaitingWallet'
    ? signing
    : signing + 1
}

const VAULT_REQUEST_STEPS: Record<VaultRequestState, number> = {
  AwaitingFlush: 2,
  AwaitingSend: 3,
  AwaitingSignature: 4,
  AwaitingBroadcast: 5,
  AwaitingAttestation: 6,
  AwaitingAttestationQueue: 7,
  AwaitingAttestationFlush: 7,
  Attested: 8,
}
