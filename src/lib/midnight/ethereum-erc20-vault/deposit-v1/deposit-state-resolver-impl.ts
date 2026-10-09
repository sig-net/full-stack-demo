import 'server-only'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
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
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'

export class DepositStateResolverImpl implements DepositStateResolver {
  private readonly depositRepository: DepositRepository
  private readonly stateController: DepositStateController
  private readonly midnightTransactionRepository: MidnightTransactionRepository
  private readonly vaultRequestRepository: VaultRequestRepository
  private readonly unitOfWork: UnitOfWork

  constructor(
    depositRepository: DepositRepository,
    stateController: DepositStateController,
    midnightTransactionRepository: MidnightTransactionRepository,
    vaultRequestRepository: VaultRequestRepository,
    unitOfWork: UnitOfWork,
  ) {
    this.depositRepository = depositRepository
    this.stateController = stateController
    this.midnightTransactionRepository = midnightTransactionRepository
    this.vaultRequestRepository = vaultRequestRepository
    this.unitOfWork = unitOfWork
  }

  /** Reads outside any transaction: the controller re-reads under lock before it writes. */
  async resolveDeposit({ name }: ResolveDepositArgs): Promise<void> {
    const deposit = await this.depositRepository.get(name)
    if (deposit === undefined || isTerminal(deposit.state)) return
    await this.resolve(deposit)
  }

  /** One deposit's failure does not stop the rest. */
  async resolvePending(): Promise<void> {
    for (const state of PENDING_STATES) {
      const deposits = await this.depositRepository.search({
        criteria: [{ type: 'exact-text', field: 'state', text: state }],
        order: { field: 'createTime', direction: 'asc' },
      })
      for (const deposit of deposits) {
        try {
          await this.resolve(deposit)
        } catch (error: unknown) {
          console.error(`Resolving deposit ${deposit.name} failed`, error)
        }
      }
    }
  }

  private resolve(deposit: Deposit): Promise<void> {
    switch (deposit.state) {
      case 'AwaitingStartTransaction':
        return this.resolveAwaitingStartTransaction(deposit)
      case 'AwaitingVaultRequest':
        return this.resolveAwaitingVaultRequest(deposit)
      case 'AwaitingCompletion':
        return Promise.resolve()
      case 'AwaitingCompleteTransaction':
        return this.resolveAwaitingCompleteTransaction(deposit)
      case 'Completed':
      case 'Failed':
        return Promise.resolve()
      default: {
        const unhandled: never = deposit.state
        throw new Error(`Unhandled state ${JSON.stringify(unhandled)}`)
      }
    }
  }

  /** A start call that ended without reaching the chain cannot be rebuilt here: its witness is the caller's secret. */
  private async resolveAwaitingStartTransaction({ name }: Deposit): Promise<void> {
    const transaction = await this.latestTransaction(name, 'startDeposit')
    switch (transaction?.state) {
      case 'Succeeded':
        return this.write(() => this.stateController.recordStarted({ name }))
      case 'Failed':
        return this.write(() =>
          this.stateController.recordStartFailure({ name, error: failureMessage(transaction) }),
        )
      default:
        return
    }
  }

  private async resolveAwaitingVaultRequest({ name }: Deposit): Promise<void> {
    const request = await this.latestVaultRequest(name)
    if (request?.state !== 'Attested') return
    return this.write(() => this.stateController.recordAttested({ name }))
  }

  private async resolveAwaitingCompleteTransaction({ name }: Deposit): Promise<void> {
    const transaction = await this.latestTransaction(name, 'completeDeposit')
    switch (transaction?.state) {
      case 'Succeeded': {
        const request = await this.latestVaultRequest(name)
        if (request === undefined) {
          throw new Error(`${name} completed without a vault request`)
        }
        const outcome = depositOutcome(request)
        return this.write(() => this.stateController.recordCompleted({ name, outcome }))
      }
      case 'Failed':
        return this.write(() => this.stateController.recordCompleteFailure({ name }))
      default:
        return
    }
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

const PENDING_STATES: readonly DepositState[] = DEPOSIT_STATES.filter((state) => !isTerminal(state))

function isTerminal(state: DepositState): boolean {
  return DEPOSIT_TERMINAL_STATES.some((terminal) => terminal === state)
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
