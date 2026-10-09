import 'server-only'

import type { VaultCircuitId } from '@sig-net/midnight-examples-erc20-vault-contract'
import { randomUUID } from 'node:crypto'

import { callerOf } from '@/lib/caller/caller'
import { isUniqueViolation } from '@/lib/db/unique-violation'
import {
  type EthereumTransaction,
  ethereumTransactionName,
} from '@/lib/ethereum/transaction-v1/transaction'
import type { EthereumTransactionStateController } from '@/lib/ethereum/transaction-v1/transaction-state-controller'
import type { EventPublisher } from '@/lib/event/event-publisher'
import {
  queueAttestationCircuit,
  SEND_CIRCUIT_BY_ACTION,
} from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import {
  type QueueRequestArgs,
  type RecordAttestationArgs,
  type RecordAttestationQueuedArgs,
  type RecordAttestedArgs,
  type RecordBroadcastArgs,
  type RecordFlushedArgs,
  type RecordSentArgs,
  type RecordSignatureArgs,
  type StartAttestationQueueArgs,
  type StartBroadcastArgs,
  type StartSendArgs,
  VAULT_REQUEST_EVENT_BY_STATE,
  VaultRequestStateConflict,
  type VaultRequestStateController,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import {
  assertConsistent,
  INITIAL_STATE,
  nextState,
  type VaultRequestStateAction,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-machine'
import {
  type MidnightTransaction,
  midnightTransactionName,
} from '@/lib/midnight/transaction-v1/transaction'
import type { MidnightTransactionStateController } from '@/lib/midnight/transaction-v1/transaction-state-controller'

export class VaultRequestStateControllerImpl implements VaultRequestStateController {
  private readonly requestRepository: VaultRequestRepository
  private readonly eventPublisher: EventPublisher
  private readonly midnightTransactionStateController: MidnightTransactionStateController
  private readonly ethereumTransactionStateController: EthereumTransactionStateController

  constructor(
    requestRepository: VaultRequestRepository,
    eventPublisher: EventPublisher,
    midnightTransactionStateController: MidnightTransactionStateController,
    ethereumTransactionStateController: EthereumTransactionStateController,
  ) {
    this.requestRepository = requestRepository
    this.eventPublisher = eventPublisher
    this.midnightTransactionStateController = midnightTransactionStateController
    this.ethereumTransactionStateController = ethereumTransactionStateController
  }

  async queueRequest(args: QueueRequestArgs): Promise<VaultRequest> {
    const now = new Date()
    const request: VaultRequest = { ...args.request, createTime: now, updateTime: now }
    if (request.state !== INITIAL_STATE) {
      throw new Error(`${request.name} cannot be queued in state ${request.state}`)
    }
    assertConsistent(request)
    const stored = await this.requestRepository.create(request)
    await this.publishEntered(stored)
    return stored
  }

  recordFlushed({ name, outIndex }: RecordFlushedArgs): Promise<VaultRequest> {
    return this.transition(name, 'recordFlushed', { outIndex })
  }

  recordSent({ name, requestId }: RecordSentArgs): Promise<VaultRequest> {
    return this.transition(name, 'recordSent', { requestId })
  }

  recordSignature({ name, signedTx }: RecordSignatureArgs): Promise<VaultRequest> {
    return this.transition(name, 'recordSignature', { signedTx })
  }

  recordBroadcast({ name }: RecordBroadcastArgs): Promise<VaultRequest> {
    return this.transition(name, 'recordBroadcast', {})
  }

  recordAttestation({ name, ...attestation }: RecordAttestationArgs): Promise<VaultRequest> {
    return this.transition(name, 'recordAttestation', attestation)
  }

  recordAttestationQueued({ name }: RecordAttestationQueuedArgs): Promise<VaultRequest> {
    return this.transition(name, 'recordAttestationQueued', {})
  }

  recordAttested({ name }: RecordAttestedArgs): Promise<VaultRequest> {
    return this.transition(name, 'recordAttested', {})
  }

  async startSend({ name, unprovenTx }: StartSendArgs): Promise<MidnightTransaction> {
    const request = await this.lockedIn(name, 'AwaitingSend', 'startSend')
    return this.commitMidnightChild(
      request,
      'startSend',
      SEND_CIRCUIT_BY_ACTION[request.action],
      unprovenTx,
    )
  }

  async startBroadcast({ name }: StartBroadcastArgs): Promise<EthereumTransaction> {
    const request = await this.lockedIn(name, 'AwaitingBroadcast', 'startBroadcast')
    const { signedTx } = request
    if (signedTx === null) {
      throw new Error(`${name} holds no signed transaction`)
    }
    const now = new Date()
    return this.commitChild(request, 'startBroadcast', () =>
      this.ethereumTransactionStateController.commitTransaction({
        transaction: {
          name: ethereumTransactionName(callerOf(request.name), randomUUID()),
          parent: request.name,
          state: 'AwaitingSubmission',
          signedTx,
          txHash: null,
          blockNumber: null,
          expireTime: null,
          failure: null,
          error: null,
          createTime: now,
          updateTime: now,
        },
      }),
    )
  }

  async startAttestationQueue({
    name,
    unprovenTx,
  }: StartAttestationQueueArgs): Promise<MidnightTransaction> {
    const request = await this.lockedIn(name, 'AwaitingAttestationQueue', 'startAttestationQueue')
    if (request.attestationOutput === null) {
      throw new Error(`${name} holds no attestation`)
    }
    return this.commitMidnightChild(
      request,
      'startAttestationQueue',
      queueAttestationCircuit(request.attestationOutput.length / 2),
      unprovenTx,
    )
  }

  /** The row is read locked, so two actors applying actions at once are serialised and the second sees the state the first left. */
  private async transition(
    name: string,
    action: VaultRequestStateAction,
    patch: Partial<VaultRequest>,
  ): Promise<VaultRequest> {
    const current = await this.locked(name)
    const state = nextState(current.state, action)
    if (state === undefined) {
      throw new VaultRequestStateConflict(name, current.state, action)
    }
    const next: VaultRequest = { ...current, ...patch, state, updateTime: new Date() }
    assertConsistent(next)
    const stored = await this.requestRepository.update(next)
    await this.publishEntered(stored)
    return stored
  }

  private async locked(name: string): Promise<VaultRequest> {
    const [current] = await this.requestRepository.search({
      criteria: [{ type: 'exact-text', field: 'name', text: name }],
      lock: 'update',
    })
    if (current === undefined) {
      throw new Error(`${name} does not exist`)
    }
    return current
  }

  /** A starter holds the row lock while it commits the child, so a stale resolver sees the state the step left. */
  private async lockedIn(
    name: string,
    state: VaultRequest['state'],
    action: string,
  ): Promise<VaultRequest> {
    const current = await this.locked(name)
    if (current.state !== state) {
      throw new VaultRequestStateConflict(name, current.state, action)
    }
    return current
  }

  private commitMidnightChild(
    request: VaultRequest,
    action: string,
    circuit: VaultCircuitId,
    unprovenTx: string,
  ): Promise<MidnightTransaction> {
    const now = new Date()
    return this.commitChild(request, action, () =>
      this.midnightTransactionStateController.commitTransaction({
        transaction: {
          name: midnightTransactionName(callerOf(request.name), randomUUID()),
          parent: request.name,
          state: 'AwaitingProof',
          circuit,
          signer: 'relayer',
          unprovenTx,
          unboundTx: null,
          finalizedTx: null,
          expireTime: new Date(now.getTime() + RELAYER_TRANSACTION_TTL_MS),
          txId: null,
          failure: null,
          error: null,
          createTime: now,
          updateTime: now,
        },
      }),
    )
  }

  /** The child's live index refusing the row means another resolver committed a child first. */
  private async commitChild<Child>(
    request: VaultRequest,
    action: string,
    commit: () => Promise<Child>,
  ): Promise<Child> {
    try {
      return await commit()
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new VaultRequestStateConflict(request.name, request.state, action)
      }
      throw error
    }
  }

  private publishEntered(request: VaultRequest): Promise<void> {
    return this.eventPublisher.publishEvent(
      VAULT_REQUEST_EVENT_BY_STATE[request.state].create(request.name, {
        name: request.name,
        parent: request.parent,
      }),
    )
  }
}

/** How long a relayer call stays submittable before the node refuses it. */
const RELAYER_TRANSACTION_TTL_MS = 60 * 60 * 1000
