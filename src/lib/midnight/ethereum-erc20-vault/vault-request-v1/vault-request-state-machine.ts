import type {
  VaultRequest,
  VaultRequestState,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'

/** The state a request enters when `action` is applied in `state`, or undefined if refused. */
export function nextState(
  state: VaultRequestState,
  action: VaultRequestStateAction,
): VaultRequestState | undefined {
  return TRANSITIONS[state][action]
}

/** One action per ledger step recorded, each legal from exactly one state. */
export type VaultRequestStateAction =
  | 'recordFlushed'
  | 'recordSent'
  | 'recordSignature'
  | 'recordBroadcast'
  | 'recordAttestation'
  | 'recordAttestationQueued'
  | 'recordAttested'

const TRANSITIONS: Record<
  VaultRequestState,
  Partial<Record<VaultRequestStateAction, VaultRequestState>>
> = {
  AwaitingFlush: { recordFlushed: 'AwaitingSend' },
  AwaitingSend: { recordSent: 'AwaitingSignature' },
  AwaitingSignature: { recordSignature: 'AwaitingBroadcast' },
  AwaitingBroadcast: { recordBroadcast: 'AwaitingAttestation' },
  AwaitingAttestation: { recordAttestation: 'AwaitingAttestationQueue' },
  AwaitingAttestationQueue: { recordAttestationQueued: 'AwaitingAttestationFlush' },
  AwaitingAttestationFlush: { recordAttested: 'Attested' },
  Attested: {},
}

/** The state a request is queued in. */
export const INITIAL_STATE: VaultRequestState = 'AwaitingFlush'

/** Throws unless the request holds exactly the step fields its state requires. */
export function assertConsistent(request: VaultRequest): void {
  const { set, unset } = FIELDS_BY_STATE[request.state]
  for (const field of set) {
    if (request[field] === null) {
      throw new Error(`${request.name} in state ${request.state} must have ${field} set`)
    }
  }
  for (const field of unset) {
    if (request[field] !== null) {
      throw new Error(`${request.name} in state ${request.state} must have ${field} unset`)
    }
  }
}

type StepField =
  | 'outIndex'
  | 'requestId'
  | 'signedTx'
  | 'attestationBlockHeight'
  | 'attestationOutputKind'
  | 'attestationDigest'
  | 'attestationSignature'
  | 'attestationOutput'

const ATTESTATION_FIELDS: readonly StepField[] = [
  'attestationBlockHeight',
  'attestationOutputKind',
  'attestationDigest',
  'attestationSignature',
  'attestationOutput',
]

/** What each state holds: every field a step produced stays set for the rest of the lifecycle. */
const FIELDS_BY_STATE: Record<
  VaultRequestState,
  { set: readonly StepField[]; unset: readonly StepField[] }
> = {
  AwaitingFlush: { set: [], unset: ['outIndex', 'requestId', 'signedTx', ...ATTESTATION_FIELDS] },
  AwaitingSend: { set: ['outIndex'], unset: ['requestId', 'signedTx', ...ATTESTATION_FIELDS] },
  AwaitingSignature: { set: ['outIndex', 'requestId'], unset: ['signedTx', ...ATTESTATION_FIELDS] },
  AwaitingBroadcast: { set: ['outIndex', 'requestId', 'signedTx'], unset: ATTESTATION_FIELDS },
  AwaitingAttestation: { set: ['outIndex', 'requestId', 'signedTx'], unset: ATTESTATION_FIELDS },
  AwaitingAttestationQueue: {
    set: ['outIndex', 'requestId', 'signedTx', ...ATTESTATION_FIELDS],
    unset: [],
  },
  AwaitingAttestationFlush: {
    set: ['outIndex', 'requestId', 'signedTx', ...ATTESTATION_FIELDS],
    unset: [],
  },
  Attested: { set: ['outIndex', 'requestId', 'signedTx', ...ATTESTATION_FIELDS], unset: [] },
}
