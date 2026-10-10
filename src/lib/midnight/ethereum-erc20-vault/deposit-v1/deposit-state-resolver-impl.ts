import 'server-only'

import { hexToBytes } from '@sig-net/midnight'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
import { lazySingleton } from '@/lib/lazy-singleton'
import {
  type Deposit,
  DEPOSIT_STATES,
  DEPOSIT_TERMINAL_STATES,
  type DepositOutcome,
  type DepositState,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import type { DepositRepository } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-repository'
import {
  DepositStateConflict,
  type DepositStateController,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
import type {
  DepositStateResolver,
  ResolveDepositArgs,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-resolver'
import {
  type RequestLedger,
  type RequestLedgerState,
  requestStage,
} from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import {
  MIDNIGHT_TRANSACTION_TERMINAL_STATES,
  type MidnightTransaction,
  type MidnightTransactionState,
} from '@/lib/midnight/transaction-v1/transaction'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'

/**
 * The vault ledger is the acknowledgement of the caller's two circuit calls: a child that failed
 * is believed only once the ledger agrees, since a node can apply a transaction whose
 * acknowledgement never came back.
 */
export class DepositStateResolverImpl implements DepositStateResolver {
  private readonly depositRepository: DepositRepository
  private readonly stateController: DepositStateController
  private readonly midnightTransactionRepository: MidnightTransactionRepository
  private readonly vaultRequestRepository: VaultRequestRepository
  private readonly requestLedger: RequestLedger
  private readonly unitOfWork: UnitOfWork

  constructor(
    depositRepository: DepositRepository,
    stateController: DepositStateController,
    midnightTransactionRepository: MidnightTransactionRepository,
    vaultRequestRepository: VaultRequestRepository,
    requestLedger: RequestLedger,
    unitOfWork: UnitOfWork,
  ) {
    this.depositRepository = depositRepository
    this.stateController = stateController
    this.midnightTransactionRepository = midnightTransactionRepository
    this.vaultRequestRepository = vaultRequestRepository
    this.requestLedger = requestLedger
    this.unitOfWork = unitOfWork
  }

  /** Reads outside any transaction: the controller re-reads under lock before it writes. */
  async resolveDeposit({ name }: ResolveDepositArgs): Promise<void> {
    const deposit = await this.depositRepository.get(name)
    if (deposit === undefined || isTerminal(deposit.state)) return
    await this.resolve(deposit, this.ledgerOnce())
  }

  /** One deposit's failure does not stop the rest. */
  async resolvePending(): Promise<void> {
    const ledger = this.ledgerOnce()
    for (const state of PENDING_STATES) {
      const deposits = await this.depositRepository.search({
        criteria: [{ type: 'exact-text', field: 'state', text: state }],
        order: { field: 'createTime', direction: 'asc' },
      })
      for (const deposit of deposits) {
        try {
          await this.resolve(deposit, ledger)
        } catch (error: unknown) {
          console.error(`Resolving deposit ${deposit.name} failed`, error)
        }
      }
    }
  }

  /** One ledger read serves every deposit of a pass that needs one, and none is made when none does. */
  private ledgerOnce(): LedgerRead {
    return lazySingleton(() => this.requestLedger.state())
  }

  private resolve(deposit: Deposit, ledger: LedgerRead): Promise<void> {
    switch (deposit.state) {
      case 'AwaitingStartTransaction':
        return this.resolveAwaitingStartTransaction(deposit, ledger)
      case 'AwaitingVaultRequest':
        return this.resolveAwaitingVaultRequest(deposit)
      case 'AwaitingCompletion':
        return this.resolveAwaitingCompletion(deposit, ledger)
      case 'AwaitingCompleteTransaction':
        return this.resolveAwaitingCompleteTransaction(deposit, ledger)
      case 'Completed':
      case 'Failed':
        return Promise.resolve()
      default: {
        const unhandled: never = deposit.state
        throw new Error(`Unhandled state ${JSON.stringify(unhandled)}`)
      }
    }
  }

  /**
   * A start call that ended without reaching the chain cannot be rebuilt here: its witness is
   * the caller's secret. A request the ledger never held and one it has settled read the same
   * there, and a deposit still awaiting its start can only be the former.
   */
  private async resolveAwaitingStartTransaction(
    { name, inIndex }: Deposit,
    ledger: LedgerRead,
  ): Promise<void> {
    const transaction = await this.latestTransaction(name, 'startDeposit')
    switch (transaction?.state) {
      case 'Succeeded':
        return this.write(() => this.stateController.recordStarted({ name }))
      case 'Failed': {
        const stage = requestStage(await ledger(), 'deposit', inIndex, { requestId: null })
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

  private async resolveAwaitingVaultRequest({ name }: Deposit): Promise<void> {
    const request = await this.latestVaultRequest(name)
    if (request?.state !== 'Attested') return
    return this.write(() => this.stateController.recordAttested({ name }))
  }

  /** The caller's to-do, unless the ledger shows the complete settled: a lost acknowledgement or another client landed it. */
  private async resolveAwaitingCompletion(deposit: Deposit, ledger: LedgerRead): Promise<void> {
    const transaction = await this.latestTransaction(deposit.name, 'completeDeposit')
    if (transaction !== undefined && !isMidnightTerminal(transaction.state)) return
    return this.recordIfSettled(deposit, ledger, () => Promise.resolve())
  }

  private async resolveAwaitingCompleteTransaction(
    deposit: Deposit,
    ledger: LedgerRead,
  ): Promise<void> {
    const { name } = deposit
    const transaction = await this.latestTransaction(name, 'completeDeposit')
    switch (transaction?.state) {
      case 'Succeeded': {
        const request = await this.vaultRequestOf(deposit)
        const outcome = depositOutcome(request)
        return this.write(() => this.stateController.recordCompleted({ name, outcome }))
      }
      case 'Failed':
        return this.recordIfSettled(deposit, ledger, () =>
          this.write(() => this.stateController.recordCompleteFailure({ name })),
        )
      default:
        return
    }
  }

  /** A settled request on the ledger is the complete having landed, whatever its child says. */
  private async recordIfSettled(
    deposit: Deposit,
    ledger: LedgerRead,
    otherwise: () => Promise<void>,
  ): Promise<void> {
    const request = await this.vaultRequestOf(deposit)
    const stage = requestStage(await ledger(), request.action, request.inIndex, {
      requestId: request.requestId === null ? null : hexToBytes(request.requestId),
    })
    if (stage.stage !== 'settled') return otherwise()
    const outcome = depositOutcome(request)
    return this.write(() => this.stateController.recordCompleted({ name: deposit.name, outcome }))
  }

  private async latestTransaction(
    name: string,
    circuit: 'startDeposit' | 'completeDeposit',
  ): Promise<MidnightTransaction | undefined> {
    const [latest] = await this.midnightTransactionRepository.search({
      criteria: [
        { type: 'exact-text', field: 'parent', text: name },
        { type: 'exact-text', field: 'circuit', text: circuit },
      ],
      order: { field: 'createTime', direction: 'desc' },
      limit: 1,
    })
    return latest
  }

  /** Every state from `AwaitingCompletion` on holds a vault request, so a missing one is a bug. */
  private async vaultRequestOf({ name }: Deposit): Promise<VaultRequest> {
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
  private async write(transition: () => Promise<Deposit>): Promise<void> {
    try {
      await this.unitOfWork.runInTransaction(transition)
    } catch (error: unknown) {
      if (!(error instanceof DepositStateConflict)) throw error
    }
  }
}

/** A ledger read deferred until a branch needs it, shared across one resolve or one sweep. */
type LedgerRead = () => Promise<RequestLedgerState>

const PENDING_STATES: readonly DepositState[] = DEPOSIT_STATES.filter((state) => !isTerminal(state))

function isTerminal(state: DepositState): boolean {
  return DEPOSIT_TERMINAL_STATES.some((terminal) => terminal === state)
}

function isMidnightTerminal(state: MidnightTransactionState): boolean {
  return MIDNIGHT_TRANSACTION_TERMINAL_STATES.some((terminal) => terminal === state)
}

/** The sweep's attested output is the Borsh `bool` of the transfer's success: `01` for a mint. */
function depositOutcome(request: VaultRequest): DepositOutcome {
  return request.attestationOutputKind === 'executed' && request.attestationOutput === '01'
    ? 'minted'
    : 'closed'
}

function failureMessage(transaction: MidnightTransaction): string {
  return transaction.error ?? transaction.failure ?? 'unknown'
}
