import 'server-only'

import type { VaultCircuitId } from '@sig-net/midnight-examples-erc20-vault-contract'
import { randomUUID } from 'node:crypto'

import { callerOf } from '@/lib/caller/caller'
import {
  type EthereumTransaction,
  ethereumTransactionName,
  isTerminalEthereumTransactionState,
} from '@/lib/ethereum/transaction-v1/transaction'
import type { EthereumTransactionRepository } from '@/lib/ethereum/transaction-v1/transaction-repository'
import type { EthereumTransactionStateController } from '@/lib/ethereum/transaction-v1/transaction-state-controller'
import type { EventPublisher } from '@/lib/event/event-publisher'
import { SEND_CIRCUIT_BY_ACTION } from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
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
  isTerminalMidnightTransactionState,
  type MidnightTransaction,
  midnightTransactionName,
} from '@/lib/midnight/transaction-v1/transaction'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import type { MidnightTransactionStateController } from '@/lib/midnight/transaction-v1/transaction-state-controller'
import type { Logger } from '@/lib/logging/logger'

export class VaultRequestStateControllerImpl implements VaultRequestStateController {
  private readonly requestRepository: VaultRequestRepository
  private readonly eventPublisher: EventPublisher
  private readonly midnightTransactionRepository: MidnightTransactionRepository
  private readonly midnightTransactionStateController: MidnightTransactionStateController
  private readonly ethereumTransactionRepository: EthereumTransactionRepository
  private readonly ethereumTransactionStateController: EthereumTransactionStateController
  private readonly logger: Logger

  constructor(
    requestRepository: VaultRequestRepository,
    eventPublisher: EventPublisher,
    midnightTransactionRepository: MidnightTransactionRepository,
    midnightTransactionStateController: MidnightTransactionStateController,
    ethereumTransactionRepository: EthereumTransactionRepository,
    ethereumTransactionStateController: EthereumTransactionStateController,
    logger: Logger,
  ) {
    this.requestRepository = requestRepository
    this.eventPublisher = eventPublisher
    this.midnightTransactionRepository = midnightTransactionRepository
    this.midnightTransactionStateController = midnightTransactionStateController
    this.ethereumTransactionRepository = ethereumTransactionRepository
    this.ethereumTransactionStateController = ethereumTransactionStateController
    this.logger = logger
  }

  async queueRequest(args: QueueRequestArgs): Promise<VaultRequest> {
    const now = new Date()
    const stored = await this.requestRepository.create({
      ...args,
      state: INITIAL_STATE,
      outIndex: null,
      requestId: null,
      signedTx: null,
      attestationBlockHeight: null,
      attestationOutputKind: null,
      attestationDigest: null,
      attestationSignature: null,
      attestationOutput: null,
      createTime: now,
      updateTime: now,
    })
    await this.eventPublisher.publishEvent(
      VAULT_REQUEST_EVENT_BY_STATE[stored.state].create(stored.name, {
        name: stored.name,
        parent: stored.parent,
      }),
    )
    this.logger.info('resource created', {
      resource: stored.name,
      parent: stored.parent,
      toState: stored.state,
    })
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
    const children = await this.ethereumTransactionRepository.search({
      criteria: [{ type: 'exact-text', field: 'parent', text: request.name }],
    })
    if (children.some((child) => !isTerminalEthereumTransactionState(child.state))) {
      throw new VaultRequestStateConflict(request.name, request.state, 'startBroadcast')
    }
    return this.ethereumTransactionStateController.commitTransaction({
      name: ethereumTransactionName(callerOf(request.name), randomUUID()),
      parent: request.name,
      signedTx,
      expireTime: null,
    })
  }

  async startAttestationQueue({
    name,
    unprovenTx,
  }: StartAttestationQueueArgs): Promise<MidnightTransaction> {
    const request = await this.lockedIn(name, 'AwaitingAttestationQueue', 'startAttestationQueue')
    return this.commitMidnightChild(
      request,
      'startAttestationQueue',
      'queueAttestation',
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
    await this.eventPublisher.publishEvent(
      VAULT_REQUEST_EVENT_BY_STATE[stored.state].create(stored.name, {
        name: stored.name,
        parent: stored.parent,
      }),
    )
    this.logger.info('transition applied', {
      resource: stored.name,
      parent: stored.parent,
      action,
      fromState: current.state,
      toState: stored.state,
    })
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

  /** The row lock alone cannot refuse a second starter, since a starter leaves the state alone: the live child does. */
  private async commitMidnightChild(
    request: VaultRequest,
    action: string,
    circuit: VaultCircuitId,
    unprovenTx: string,
  ): Promise<MidnightTransaction> {
    const children = await this.midnightTransactionRepository.search({
      criteria: [
        { type: 'exact-text', field: 'parent', text: request.name },
        { type: 'exact-text', field: 'circuit', text: circuit },
      ],
    })
    if (children.some((child) => !isTerminalMidnightTransactionState(child.state))) {
      throw new VaultRequestStateConflict(request.name, request.state, action)
    }
    return this.midnightTransactionStateController.commitTransaction({
      name: midnightTransactionName(callerOf(request.name), randomUUID()),
      parent: request.name,
      circuit,
      signer: 'relayer',
      unprovenTx,
    })
  }
}
