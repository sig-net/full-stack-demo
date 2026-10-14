import 'server-only'

import { hexToBytes } from '@sig-net/midnight'
import type { VaultCircuitId } from '@sig-net/midnight-examples-erc20-vault-contract'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
import { lazySingleton } from '@/lib/lazy-singleton'
import {
  CALLER_OPERATION_PENDING_STATES,
  type CallerOperation,
  isTerminalCallerOperationState,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation'
import {
  CallerOperationStateConflict,
  type CallerOperationStateController,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'
import type { CallerOperationKind } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller-impl'
import {
  type RequestLedger,
  type RequestLedgerState,
  requestStage,
} from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import {
  isTerminalMidnightTransactionState,
  type MidnightTransaction,
} from '@/lib/midnight/transaction-v1/transaction'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import type { Repository } from '@/lib/repository/repository'

/** What the resolver reads of a kind beyond the controller's needs: the start circuits and the complete's verdict. */
export interface CallerOperationResolution<Resource extends CallerOperation> extends Pick<
  CallerOperationKind<Resource>,
  'action' | 'completeCircuit'
> {
  /** Names the operation in a log line. */
  readonly label: string
  /** The circuits a start call may carry: one for most operations, both approval starts for an approval. */
  readonly startCircuits: readonly VaultCircuitId[]
  /** What the complete call did, read from the attested request it settled. */
  readonly outcomeOf: (request: VaultRequest) => NonNullable<Resource['outcome']>
}

/**
 * The vault ledger is the acknowledgement of the caller's two circuit calls: a child that failed
 * is believed only once the ledger agrees, since a node can apply a transaction whose
 * acknowledgement never came back.
 */
export abstract class CallerOperationStateResolverImpl<Resource extends CallerOperation> {
  private readonly kind: CallerOperationResolution<Resource>
  private readonly repository: Repository<Resource>
  private readonly stateController: CallerOperationStateController<Resource>
  private readonly midnightTransactionRepository: MidnightTransactionRepository
  private readonly vaultRequestRepository: VaultRequestRepository
  private readonly requestLedger: RequestLedger
  private readonly unitOfWork: UnitOfWork

  protected constructor(
    kind: CallerOperationResolution<Resource>,
    repository: Repository<Resource>,
    stateController: CallerOperationStateController<Resource>,
    midnightTransactionRepository: MidnightTransactionRepository,
    vaultRequestRepository: VaultRequestRepository,
    requestLedger: RequestLedger,
    unitOfWork: UnitOfWork,
  ) {
    this.kind = kind
    this.repository = repository
    this.stateController = stateController
    this.midnightTransactionRepository = midnightTransactionRepository
    this.vaultRequestRepository = vaultRequestRepository
    this.requestLedger = requestLedger
    this.unitOfWork = unitOfWork
  }

  /** Reads outside any transaction: the controller re-reads under lock before it writes. */
  async resolveOperation(name: string): Promise<void> {
    const operation = await this.repository.get(name)
    if (operation === undefined || isTerminalCallerOperationState(operation.state)) return
    await this.resolve(
      operation,
      lazySingleton(() => this.requestLedger.state()),
    )
  }

  /** One operation's failure does not stop the rest. */
  async resolvePending(): Promise<void> {
    const ledger = lazySingleton(() => this.requestLedger.state())
    for (const state of CALLER_OPERATION_PENDING_STATES) {
      const operations = await this.repository.search({
        criteria: [{ type: 'exact-text', field: 'state', text: state }],
        order: { field: 'createTime', direction: 'asc' },
      })
      for (const operation of operations) {
        try {
          await this.resolve(operation, ledger)
        } catch (error: unknown) {
          console.error(`Resolving ${this.kind.label} ${operation.name} failed`, error)
        }
      }
    }
  }

  private resolve(operation: Resource, ledger: LedgerRead): Promise<void> {
    switch (operation.state) {
      case 'AwaitingStartTransaction':
        return this.resolveAwaitingStartTransaction(operation, ledger)
      case 'AwaitingVaultRequest':
        return this.resolveAwaitingVaultRequest(operation)
      case 'AwaitingCompletion':
        return this.resolveAwaitingCompletion(operation, ledger)
      case 'AwaitingCompleteTransaction':
        return this.resolveAwaitingCompleteTransaction(operation, ledger)
      case 'Completed':
      case 'Failed':
        return Promise.resolve()
      default: {
        const unhandled: never = operation.state
        throw new Error(`Unhandled state ${JSON.stringify(unhandled)}`)
      }
    }
  }

  /**
   * A start call that ended without reaching the chain cannot be rebuilt here: its witness is
   * the caller's secret. A request the ledger never held and one it has settled read the same
   * there, and an operation still awaiting its start can only be the former.
   */
  private async resolveAwaitingStartTransaction(
    { name, inIndex }: Resource,
    ledger: LedgerRead,
  ): Promise<void> {
    const transaction = await this.latestTransaction(name, this.kind.startCircuits)
    switch (transaction?.state) {
      case 'Succeeded':
        return this.write(() => this.stateController.recordStarted({ name }))
      case 'Failed': {
        const stage = requestStage(await ledger(), this.kind.action, inIndex, { requestId: null })
        if (stage.stage !== 'settled') {
          return this.write(() => this.stateController.recordStarted({ name }))
        }
        return this.write(() =>
          this.stateController.recordStartFailure({ name, error: failureMessage(transaction) }),
        )
      }
      default:
        return
    }
  }

  private async resolveAwaitingVaultRequest({ name }: Resource): Promise<void> {
    const request = await this.latestVaultRequest(name)
    if (request?.state !== 'Attested') return
    return this.write(() => this.stateController.recordAttested({ name }))
  }

  /** The caller's to-do, unless the ledger shows the complete settled: a lost acknowledgement or another client landed it. */
  private async resolveAwaitingCompletion(operation: Resource, ledger: LedgerRead): Promise<void> {
    const transaction = await this.latestTransaction(operation.name, [this.kind.completeCircuit])
    if (transaction !== undefined && !isTerminalMidnightTransactionState(transaction.state)) return
    return this.recordIfSettled(operation, ledger, () => Promise.resolve())
  }

  private async resolveAwaitingCompleteTransaction(
    operation: Resource,
    ledger: LedgerRead,
  ): Promise<void> {
    const { name } = operation
    const transaction = await this.latestTransaction(name, [this.kind.completeCircuit])
    switch (transaction?.state) {
      case 'Succeeded': {
        const request = await this.vaultRequestOf(operation)
        const outcome = this.kind.outcomeOf(request)
        return this.write(() => this.stateController.recordCompleted({ name, outcome }))
      }
      case 'Failed':
        return this.recordIfSettled(operation, ledger, () =>
          this.write(() => this.stateController.recordCompleteFailure({ name })),
        )
      default:
        return
    }
  }

  /** A settled request on the ledger is the complete having landed, whatever its child says. */
  private async recordIfSettled(
    operation: Resource,
    ledger: LedgerRead,
    otherwise: () => Promise<void>,
  ): Promise<void> {
    const request = await this.vaultRequestOf(operation)
    const stage = requestStage(await ledger(), request.action, request.inIndex, {
      requestId: request.requestId === null ? null : hexToBytes(request.requestId),
    })
    if (stage.stage !== 'settled') return otherwise()
    const outcome = this.kind.outcomeOf(request)
    return this.write(() => this.stateController.recordCompleted({ name: operation.name, outcome }))
  }

  /** The newest of the operation's transactions that carry one of `circuits`. */
  private async latestTransaction(
    name: string,
    circuits: readonly VaultCircuitId[],
  ): Promise<MidnightTransaction | undefined> {
    let latest: MidnightTransaction | undefined
    for (const circuit of circuits) {
      const [candidate] = await this.midnightTransactionRepository.search({
        criteria: [
          { type: 'exact-text', field: 'parent', text: name },
          { type: 'exact-text', field: 'circuit', text: circuit },
        ],
        order: { field: 'createTime', direction: 'desc' },
        limit: 1,
      })
      if (
        candidate !== undefined &&
        (latest === undefined || candidate.createTime > latest.createTime)
      ) {
        latest = candidate
      }
    }
    return latest
  }

  /** Every state from `AwaitingCompletion` on holds a vault request, so a missing one is a bug. */
  private async vaultRequestOf({ name }: Resource): Promise<VaultRequest> {
    const request = await this.latestVaultRequest(name)
    if (request === undefined) throw new Error(`${name} has no vault request to complete`)
    return request
  }

  private async latestVaultRequest(name: string): Promise<VaultRequest | undefined> {
    const [latest] = await this.vaultRequestRepository.search({
      criteria: [{ type: 'exact-text', field: 'parent', text: name }],
      order: { field: 'createTime', direction: 'desc' },
      limit: 1,
    })
    return latest
  }

  /** One transition per resolve. A conflict means another resolver applied it first. */
  private async write(transition: () => Promise<Resource>): Promise<void> {
    try {
      await this.unitOfWork.runInTransaction(transition)
    } catch (error: unknown) {
      if (!(error instanceof CallerOperationStateConflict)) throw error
    }
  }
}

/** One ledger read, deferred until a branch needs it and shared across one resolve or one sweep. */
type LedgerRead = () => Promise<RequestLedgerState>

function failureMessage(transaction: MidnightTransaction): string {
  return transaction.error ?? transaction.failure ?? 'unknown'
}
