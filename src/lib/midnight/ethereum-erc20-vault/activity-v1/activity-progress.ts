import type {
  Activity,
  ActivityTransaction,
  ActivityType,
  ActivityWalletTransaction,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import type { CallerOperationState } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation'
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
  if (activity.resourceState === 'AwaitingCompletion') return { kind: 'complete' }
  return { kind: 'none' }
}

/** One step of an activity's flow, in order, with where the activity stands against it. */
export interface ActivityStep {
  readonly label: string
  /** How the caller's wallet takes the step by balancing and signing a call, null for a step it takes no part in. */
  readonly walletTurn: WalletTurn | null
  readonly status: ActivityStepStatus
  /** The identifier the step leaves on a chain or at the MPC, for a step that leaves one. */
  readonly reference: ActivityReference | null
}

export type ActivityStepStatus = 'done' | 'current' | 'pending' | 'failed'

/**
 * `signTurn`: the user signs a call the backend proved, from the activity's sign turn.
 * `inPage`: the page builds, proves and signs the call with the wallet unprompted, as it starts
 * or completes the operation.
 */
export type WalletTurn = 'signTurn' | 'inPage'

/** An identifier a step leaves behind, with `id` null until the step assigns it, and the block that holds it once a chain recorded it. */
export interface ActivityReference {
  readonly kind: ActivityReferenceKind
  readonly id: string | null
  readonly blockNumber: number | null
}

export type ActivityReferenceKind = 'midnightTransaction' | 'vaultRequest' | 'ethereumTransaction'

/** A step as the list declares it, with the reference's reader when the step leaves one. */
export interface ActivityStepDefinition {
  readonly label: string
  readonly walletTurn: WalletTurn | null
  readonly reference: {
    readonly kind: ActivityReferenceKind
    readonly idOf: (activity: Activity) => string | null
    readonly blockNumberOf: (activity: Activity) => number | null
  } | null
}

/**
 * Every activity type runs the same ten steps, as every caller operation does: the three
 * steps the MPC and Ethereum take are named for what the type's request does there, and the
 * wallet signs a deposit's calls in the page and every other type's from its sign turn.
 */
export const ACTIVITY_STEPS_BY_TYPE: Readonly<
  Record<ActivityType, readonly ActivityStepDefinition[]>
> = {
  Deposit: operationSteps(
    'inPage',
    'Sweep signed by the MPC',
    'Funds swept on Ethereum',
    'Sweep attested by the MPC',
  ),
  Withdraw: operationSteps(
    'signTurn',
    'Transfer signed by the MPC',
    'Tokens sent on Ethereum',
    'Transfer attested by the MPC',
  ),
  Swap: operationSteps(
    'signTurn',
    'Trade signed by the MPC',
    'Tokens traded on Ethereum',
    'Trade attested by the MPC',
  ),
  Supply: operationSteps(
    'signTurn',
    'Deposit signed by the MPC',
    'Tokens supplied on Ethereum',
    'Deposit attested by the MPC',
  ),
  Redeem: operationSteps(
    'signTurn',
    'Redeem signed by the MPC',
    'Shares redeemed on Ethereum',
    'Redeem attested by the MPC',
  ),
  Approval: operationSteps(
    'signTurn',
    'Approval signed by the MPC',
    'Allowance granted on Ethereum',
    'Approval attested by the MPC',
  ),
}

function operationSteps(
  walletTurn: WalletTurn,
  signed: string,
  executed: string,
  attested: string,
): readonly ActivityStepDefinition[] {
  return [
    { label: 'Start call signed by your wallet', walletTurn, reference: null },
    {
      label: 'Start call included on Midnight',
      walletTurn: null,
      reference: {
        kind: 'midnightTransaction',
        idOf: (activity) => activity.startTransaction?.hash ?? null,
        blockNumberOf: (activity) => activity.startTransaction?.blockNumber ?? null,
      },
    },
    { label: 'Request flushed to the vault queue', walletTurn: null, reference: null },
    {
      label: 'Request sent to the MPC',
      walletTurn: null,
      reference: {
        kind: 'vaultRequest',
        idOf: (activity) => activity.vaultRequestId,
        blockNumberOf: () => null,
      },
    },
    { label: signed, walletTurn: null, reference: null },
    {
      label: executed,
      walletTurn: null,
      reference: {
        kind: 'ethereumTransaction',
        idOf: (activity) => activity.foreignChainTransaction?.hash ?? null,
        blockNumberOf: (activity) => activity.foreignChainTransaction?.blockNumber ?? null,
      },
    },
    { label: attested, walletTurn: null, reference: null },
    { label: 'Attestation flushed to the vault', walletTurn: null, reference: null },
    { label: 'Completion signed by your wallet', walletTurn, reference: null },
    {
      label: 'Completion included on Midnight',
      walletTurn: null,
      reference: {
        kind: 'midnightTransaction',
        idOf: (activity) => activity.completeTransaction?.hash ?? null,
        blockNumberOf: (activity) => activity.completeTransaction?.blockNumber ?? null,
      },
    },
  ]
}

export function activityStepsOf(activity: Activity): ActivityStep[] {
  const { current, failed } = operationProgress(activity)
  return ACTIVITY_STEPS_BY_TYPE[activity.type].map(({ label, walletTurn, reference }, index) => ({
    label,
    walletTurn,
    status: index < current ? 'done' : index > current ? 'pending' : failed ? 'failed' : 'current',
    reference:
      reference === null
        ? null
        : {
            kind: reference.kind,
            id: reference.idOf(activity),
            blockNumber: reference.blockNumberOf(activity),
          },
  }))
}

/** The index of the step the operation stands at, the step count once every step is done. */
function operationProgress(activity: Activity): { current: number; failed: boolean } {
  return PROGRESS_BY_OPERATION_STATE[activity.resourceState](activity)
}

const STEP_COUNT = 10

const PROGRESS_BY_OPERATION_STATE: Record<
  CallerOperationState,
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
  Completed: () => ({ current: STEP_COUNT, failed: false }),
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
