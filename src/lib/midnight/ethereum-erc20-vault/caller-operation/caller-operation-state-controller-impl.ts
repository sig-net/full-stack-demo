import 'server-only'

import type { VaultCircuitId } from '@sig-net/midnight-examples-erc20-vault-contract'
import { randomUUID } from 'node:crypto'

import { callerOf } from '@/lib/caller/caller'
import type { EventPublisher } from '@/lib/event/event-publisher'
import type { CallerOperation } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation'
import type {
  CallerOperationEvents,
  CallerOperationStateConflict,
  CallerOperationStateController,
  CompleteOperationArgs,
  RecordAttestedArgs,
  RecordCompletedArgs,
  RecordCompleteFailureArgs,
  RecordStartedArgs,
  RecordStartFailureArgs,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'
import {
  assertConsistent,
  type CallerOperationStateAction,
  nextState,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-machine'
import type { VaultAction } from '@/lib/midnight/ethereum-erc20-vault/vault-action'
import { vaultRequestName } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { VaultRequestStateController } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import { midnightTransactionName } from '@/lib/midnight/transaction-v1/transaction'
import type { MidnightTransactionStateController } from '@/lib/midnight/transaction-v1/transaction-state-controller'
import type { Repository } from '@/lib/repository/repository'
import type { Logger } from '@/lib/logging/logger'

/** What tells one caller operation's controller and resolver apart from another's. */
export interface CallerOperationKind<Resource extends CallerOperation> {
  /** The vault action the operation's start circuit queues. */
  readonly action: VaultAction
  readonly completeCircuit: VaultCircuitId
  readonly events: CallerOperationEvents
  /** The resource's own conflict error, so a caller can tell whose state refused. */
  readonly conflict: new (
    name: string,
    state: Resource['state'],
    action: string,
  ) => CallerOperationStateConflict
  /** The EVM account the MPC signs the operation's request from. */
  readonly signerAccountOf: (resource: Resource) => string
}

/**
 * The transitions every caller operation shares. The row is read locked, so two actors applying
 * actions at once are serialised and the second sees the state the first left. A subclass
 * builds its resource's full row and hands it to `start`, and commits its complete call through
 * `complete`.
 */
export abstract class CallerOperationStateControllerImpl<
  Resource extends CallerOperation,
> implements CallerOperationStateController<Resource> {
  private readonly kind: CallerOperationKind<Resource>
  private readonly repository: Repository<Resource>
  private readonly eventPublisher: EventPublisher
  private readonly midnightTransactionStateController: MidnightTransactionStateController
  private readonly vaultRequestStateController: VaultRequestStateController
  private readonly logger: Logger

  protected constructor(
    kind: CallerOperationKind<Resource>,
    repository: Repository<Resource>,
    eventPublisher: EventPublisher,
    midnightTransactionStateController: MidnightTransactionStateController,
    vaultRequestStateController: VaultRequestStateController,
    logger: Logger,
  ) {
    this.kind = kind
    this.repository = repository
    this.eventPublisher = eventPublisher
    this.midnightTransactionStateController = midnightTransactionStateController
    this.vaultRequestStateController = vaultRequestStateController
    this.logger = logger
  }

  async recordStarted({ name }: RecordStartedArgs): Promise<Resource> {
    const started = await this.transition(name, 'recordStarted', {})
    await this.vaultRequestStateController.queueRequest({
      name: vaultRequestName(callerOf(name), randomUUID()),
      parent: name,
      action: this.kind.action,
      inIndex: started.inIndex,
      signerAccount: this.kind.signerAccountOf(started),
    })
    return started
  }

  recordStartFailure({ name, error }: RecordStartFailureArgs): Promise<Resource> {
    return this.transition(name, 'recordStartFailure', { failure: 'StartFailed', error })
  }

  recordAttested({ name }: RecordAttestedArgs): Promise<Resource> {
    return this.transition(name, 'recordAttested', {})
  }

  recordCompleted({ name, outcome }: RecordCompletedArgs<Resource>): Promise<Resource> {
    return this.transition(name, 'recordCompleted', { outcome })
  }

  recordCompleteFailure({ name }: RecordCompleteFailureArgs): Promise<Resource> {
    return this.transition(name, 'recordCompleteFailure', {})
  }

  /** Stores the row in its entry state and commits the caller's start call under it. */
  protected async start(
    row: Resource,
    circuit: VaultCircuitId,
    unprovenTx: string,
  ): Promise<Resource> {
    const stored = await this.repository.create(row)
    await this.eventPublisher.publishEvent(
      this.kind.events[stored.state].create(stored.name, { name: stored.name }),
    )
    this.logger.info('resource created', { resource: stored.name, toState: stored.state })
    await this.midnightTransactionStateController.commitTransaction({
      name: midnightTransactionName(callerOf(stored.name), randomUUID()),
      parent: stored.name,
      circuit,
      signer: 'caller',
      unprovenTx,
    })
    return stored
  }

  /** `AwaitingCompletion` to `AwaitingCompleteTransaction`, committing the caller's complete call. */
  protected async complete({ name, unprovenTx }: CompleteOperationArgs): Promise<Resource> {
    const completing = await this.transition(name, 'complete', {})
    await this.midnightTransactionStateController.commitTransaction({
      name: midnightTransactionName(callerOf(completing.name), randomUUID()),
      parent: completing.name,
      circuit: this.kind.completeCircuit,
      signer: 'caller',
      unprovenTx,
    })
    return completing
  }

  private async transition(
    name: string,
    action: CallerOperationStateAction,
    patch: Partial<Pick<CallerOperation, 'outcome' | 'failure' | 'error'>>,
  ): Promise<Resource> {
    const [current] = await this.repository.search({
      criteria: [{ type: 'exact-text', field: 'name', text: name }],
      lock: 'update',
    })
    if (current === undefined) {
      throw new Error(`${name} does not exist`)
    }
    const state = nextState(current.state, action)
    if (state === undefined) {
      throw new this.kind.conflict(name, current.state, action)
    }
    const next: Resource = { ...current, ...patch, state, updateTime: new Date() }
    assertConsistent(next)
    const stored = await this.repository.update(next)
    await this.eventPublisher.publishEvent(
      this.kind.events[stored.state].create(stored.name, { name: stored.name }),
    )
    this.logger.info('transition applied', {
      resource: stored.name,
      action,
      fromState: current.state,
      toState: stored.state,
    })
    return stored
  }
}
