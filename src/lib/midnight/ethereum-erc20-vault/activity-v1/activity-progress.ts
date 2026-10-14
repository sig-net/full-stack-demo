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
  /** True for a step only the caller's wallet can take, by balancing and signing a call. */
  readonly walletTurn: boolean
  readonly status: ActivityStepStatus
  /** The identifier the step leaves on a chain or at the MPC, for a step that leaves one. */
  readonly reference: ActivityReference | null
}

export type ActivityStepStatus = 'done' | 'current' | 'pending' | 'failed'

/** An identifier a step leaves behind, with `id` null until the step assigns it. */
export interface ActivityReference {
  readonly kind: ActivityReferenceKind
  readonly id: string | null
}

export type ActivityReferenceKind = 'midnightTransaction' | 'vaultRequest' | 'ethereumTransaction'

/** A step as the list declares it, with the reference's reader when the step leaves one. */
export interface ActivityStepDefinition {
  readonly label: string
  readonly walletTurn: boolean
  readonly reference: {
    readonly kind: ActivityReferenceKind
    readonly idOf: (activity: Activity) => string | null
  } | null
}

/** The deposit's steps in order; a second activity type brings its own list. */
export const DEPOSIT_STEPS: readonly ActivityStepDefinition[] = [
  { label: 'Start call signed by your wallet', walletTurn: true, reference: null },
  {
    label: 'Start call included on Midnight',
    walletTurn: false,
    reference: {
      kind: 'midnightTransaction',
      idOf: (activity) => activity.startTransaction?.hash ?? null,
    },
  },
  { label: 'Request flushed to the vault queue', walletTurn: false, reference: null },
  {
    label: 'Request sent to the MPC',
    walletTurn: false,
    reference: { kind: 'vaultRequest', idOf: (activity) => activity.vaultRequestId },
  },
  { label: 'Sweep signed by the MPC', walletTurn: false, reference: null },
  {
    label: 'Funds swept on Ethereum',
    walletTurn: false,
    reference: {
      kind: 'ethereumTransaction',
      idOf: (activity) => activity.foreignChainTransaction?.hash ?? null,
    },
  },
  { label: 'Sweep attested by the MPC', walletTurn: false, reference: null },
  { label: 'Attestation flushed to the vault', walletTurn: false, reference: null },
  { label: 'Completion signed by your wallet', walletTurn: true, reference: null },
  {
    label: 'Completion included on Midnight',
    walletTurn: false,
    reference: {
      kind: 'midnightTransaction',
      idOf: (activity) => activity.completeTransaction?.hash ?? null,
    },
  },
]

export function activityStepsOf(activity: Activity): ActivityStep[] {
  const { current, failed } = depositProgress(activity)
  return DEPOSIT_STEPS.map(({ label, walletTurn, reference }, index) => ({
    label,
    walletTurn,
    status: index < current ? 'done' : index > current ? 'pending' : failed ? 'failed' : 'current',
    reference: reference === null ? null : { kind: reference.kind, id: reference.idOf(activity) },
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
