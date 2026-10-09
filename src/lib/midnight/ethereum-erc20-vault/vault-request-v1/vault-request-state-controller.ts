import { z } from 'zod'

import type { EthereumTransaction } from '@/lib/ethereum/transaction-v1/transaction'
import { defineEvent, type EventDefinition } from '@/lib/event/event'
import {
  type AttestationFields,
  type VaultRequest,
  vaultRequestNameSchema,
  type VaultRequestState,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'

/**
 * The only writer of a vault request's state. Each `record` method is one transition from the
 * state machine in `vault-request-state-machine.ts`: it refuses with `VaultRequestStateConflict`
 * when the request is not in the state the action applies to, and publishes the event of the
 * state entered. Each `start` method leaves the request's state alone and commits one child
 * transaction under it, refusing with the same conflict when the request is not in the state
 * that step serves or a live child already serves it. Methods open no transaction: the caller is
 * the write boundary.
 */
export interface VaultRequestStateController {
  /** Stores a request the start circuit queued, in `AwaitingFlush`. */
  queueRequest(args: QueueRequestArgs): Promise<VaultRequest>
  /** `AwaitingFlush` to `AwaitingSend`, with the request index the flush gave the entry. */
  recordFlushed(args: RecordFlushedArgs): Promise<VaultRequest>
  /** `AwaitingSend` to `AwaitingSignature`, with the id the send recorded the request under. */
  recordSent(args: RecordSentArgs): Promise<VaultRequest>
  /** `AwaitingSignature` to `AwaitingBroadcast`, with the transaction the MPC's verified post signs. */
  recordSignature(args: RecordSignatureArgs): Promise<VaultRequest>
  /** `AwaitingBroadcast` to `AwaitingAttestation`, once the broadcast child ended either way. */
  recordBroadcast(args: RecordBroadcastArgs): Promise<VaultRequest>
  /** `AwaitingAttestation` to `AwaitingAttestationQueue`, with the verified attestation. */
  recordAttestation(args: RecordAttestationArgs): Promise<VaultRequest>
  /** `AwaitingAttestationQueue` to `AwaitingAttestationFlush`. */
  recordAttestationQueued(args: RecordAttestationQueuedArgs): Promise<VaultRequest>
  /** `AwaitingAttestationFlush` to `Attested`. */
  recordAttested(args: RecordAttestedArgs): Promise<VaultRequest>
  /** Commits the relayer's send call under a request in `AwaitingSend`. */
  startSend(args: StartSendArgs): Promise<MidnightTransaction>
  /** Commits the signed transaction under a request in `AwaitingBroadcast`. */
  startBroadcast(args: StartBroadcastArgs): Promise<EthereumTransaction>
  /** Commits the relayer's queue call under a request in `AwaitingAttestationQueue`. */
  startAttestationQueue(args: StartAttestationQueueArgs): Promise<MidnightTransaction>
}

export interface QueueRequestArgs {
  request: VaultRequest
}

export interface RecordFlushedArgs {
  name: string
  outIndex: string
}

export interface RecordSentArgs {
  name: string
  requestId: string
}

export interface RecordSignatureArgs {
  name: string
  signedTx: string
}

export interface RecordBroadcastArgs {
  name: string
}

export interface RecordAttestationArgs extends AttestationFields {
  name: string
}

export interface RecordAttestationQueuedArgs {
  name: string
}

export interface RecordAttestedArgs {
  name: string
}

export interface StartSendArgs {
  name: string
  /** The send circuit call, built for the request's `outIndex`. */
  unprovenTx: string
}

export interface StartBroadcastArgs {
  name: string
}

export interface StartAttestationQueueArgs {
  name: string
  /** The queue circuit call, built for the request's attestation. */
  unprovenTx: string
}

/** The request is not in a state the action applies to, so another actor got there first. */
export class VaultRequestStateConflict extends Error {
  readonly name = 'VaultRequestStateConflict'

  constructor(requestName: string, state: VaultRequestState, action: string) {
    super(`${requestName} is ${state}, which does not allow ${action}`)
  }
}

/** The parent is carried so that the parent's consumer can match on it without a read. */
export const vaultRequestEventDataSchema = z.object({
  name: vaultRequestNameSchema,
  parent: z.string().min(1),
})

export type VaultRequestEventData = z.infer<typeof vaultRequestEventDataSchema>

/** One lifecycle event per state entered, keyed by the request name. */
export const VAULT_REQUEST_EVENT_BY_STATE: Record<
  VaultRequestState,
  EventDefinition<VaultRequestEventData>
> = {
  AwaitingFlush: defineEvent(
    'midnight.ethereum-erc20-vault.vault-request-v1.awaiting-flush',
    vaultRequestEventDataSchema,
  ),
  AwaitingSend: defineEvent(
    'midnight.ethereum-erc20-vault.vault-request-v1.awaiting-send',
    vaultRequestEventDataSchema,
  ),
  AwaitingSignature: defineEvent(
    'midnight.ethereum-erc20-vault.vault-request-v1.awaiting-signature',
    vaultRequestEventDataSchema,
  ),
  AwaitingBroadcast: defineEvent(
    'midnight.ethereum-erc20-vault.vault-request-v1.awaiting-broadcast',
    vaultRequestEventDataSchema,
  ),
  AwaitingAttestation: defineEvent(
    'midnight.ethereum-erc20-vault.vault-request-v1.awaiting-attestation',
    vaultRequestEventDataSchema,
  ),
  AwaitingAttestationQueue: defineEvent(
    'midnight.ethereum-erc20-vault.vault-request-v1.awaiting-attestation-queue',
    vaultRequestEventDataSchema,
  ),
  AwaitingAttestationFlush: defineEvent(
    'midnight.ethereum-erc20-vault.vault-request-v1.awaiting-attestation-flush',
    vaultRequestEventDataSchema,
  ),
  Attested: defineEvent(
    'midnight.ethereum-erc20-vault.vault-request-v1.attested',
    vaultRequestEventDataSchema,
  ),
}

export const VAULT_REQUEST_EVENTS: readonly EventDefinition<VaultRequestEventData>[] =
  Object.values(VAULT_REQUEST_EVENT_BY_STATE)
