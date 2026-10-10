import { describe, expect, test } from 'vitest'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
import {
  type Deposit,
  type DepositState,
  depositStateSchema,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import {
  DEPOSIT_IN_STATE,
  DEPOSIT_NAME,
  depositFixture,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-fixtures'
import type { DepositRepository } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-repository'
import {
  DepositStateConflict,
  type DepositStateController,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
import { DepositStateResolverImpl } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-resolver-impl'
import type {
  RequestLedger,
  RequestLedgerState,
} from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import { requestLedgerAt } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger-fixtures'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import { VAULT_REQUEST_IN_STATE } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import { transactionFixture } from '@/lib/midnight/transaction-v1/transaction-fixtures'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import { mock } from '@/lib/testing/mock'

/** Which controller method a resolve ended in, with its args. */
type Transition = { method: string; args: object }

interface Case {
  name: string
  stored: Deposit | undefined
  /** The newest caller transaction the repository finds, with the circuit it must be asked for. */
  transaction?: { circuit: string; rows: MidnightTransaction[] }
  /** The newest vault request the repository finds under the deposit. */
  requests?: VaultRequest[]
  /** Where the ledger holds the request, or undefined when the ledger must not be read. */
  ledger?: RequestLedgerState
  controller?: Partial<DepositStateController>
  expectTransitions: Transition[]
  expectWrites?: number
  expectError?: string
}

interface Doubles extends Omit<
  Case,
  'name' | 'expectTransitions' | 'expectWrites' | 'expectError'
> {
  repository?: Partial<DepositRepository>
  transitions: Transition[]
  counts: { writes: number; ledgerReads: number }
}

const attested = VAULT_REQUEST_IN_STATE.Attested
const start = (overrides: Partial<MidnightTransaction>) =>
  transactionFixture({ parent: DEPOSIT_NAME, circuit: 'startDeposit', ...overrides })
const complete = (overrides: Partial<MidnightTransaction>) =>
  transactionFixture({ parent: DEPOSIT_NAME, circuit: 'completeDeposit', ...overrides })
const succeeded: Partial<MidnightTransaction> = {
  state: 'Succeeded',
  unprovenTx: null,
  unboundTx: 'unbound',
  finalizedTx: 'finalized',
  txId: 'tx-1',
}
const failed: Partial<MidnightTransaction> = {
  state: 'Failed',
  unprovenTx: null,
  failure: 'Expired',
  error: null,
}
const rejected: Partial<MidnightTransaction> = {
  ...failed,
  failure: 'Rejected',
  error: 'The Midnight node refused the transaction: 1010: Invalid Transaction',
}

const cases: Case[] = [
  {
    name: 'AwaitingStartTransaction - no start transaction yet, nothing to record',
    stored: DEPOSIT_IN_STATE.AwaitingStartTransaction,
    transaction: { circuit: 'startDeposit', rows: [] },
    expectTransitions: [],
  },
  {
    name: "AwaitingStartTransaction - the start transaction is the wallet's to-do",
    stored: DEPOSIT_IN_STATE.AwaitingStartTransaction,
    transaction: { circuit: 'startDeposit', rows: [start({ state: 'AwaitingWallet' })] },
    expectTransitions: [],
  },
  {
    name: 'AwaitingStartTransaction - the start transaction succeeded, so the start is recorded without a ledger read',
    stored: DEPOSIT_IN_STATE.AwaitingStartTransaction,
    transaction: { circuit: 'startDeposit', rows: [start(succeeded)] },
    expectTransitions: [{ method: 'recordStarted', args: { name: DEPOSIT_NAME } }],
  },
  {
    name: "AwaitingStartTransaction - the start transaction failed and the ledger holds no request, so the node's message is recorded",
    stored: DEPOSIT_IN_STATE.AwaitingStartTransaction,
    transaction: { circuit: 'startDeposit', rows: [start(rejected)] },
    ledger: requestLedgerAt('settled'),
    expectTransitions: [
      {
        method: 'recordStartFailure',
        args: { name: DEPOSIT_NAME, error: rejected.error },
      },
    ],
  },
  {
    name: 'AwaitingStartTransaction - the start transaction expired without a message and the ledger holds no request, so the reason is recorded',
    stored: DEPOSIT_IN_STATE.AwaitingStartTransaction,
    transaction: { circuit: 'startDeposit', rows: [start(failed)] },
    ledger: requestLedgerAt('settled'),
    expectTransitions: [
      { method: 'recordStartFailure', args: { name: DEPOSIT_NAME, error: 'Expired' } },
    ],
  },
  {
    name: 'AwaitingStartTransaction - the start transaction failed but the ledger queued the request, so the start is recorded',
    stored: DEPOSIT_IN_STATE.AwaitingStartTransaction,
    transaction: { circuit: 'startDeposit', rows: [start(rejected)] },
    ledger: requestLedgerAt('queued'),
    expectTransitions: [{ method: 'recordStarted', args: { name: DEPOSIT_NAME } }],
  },
  {
    name: 'AwaitingStartTransaction - the start transaction failed but the ledger flushed the request already, so the start is recorded',
    stored: DEPOSIT_IN_STATE.AwaitingStartTransaction,
    transaction: { circuit: 'startDeposit', rows: [start(failed)] },
    ledger: requestLedgerAt('flushed'),
    expectTransitions: [{ method: 'recordStarted', args: { name: DEPOSIT_NAME } }],
  },
  {
    name: 'AwaitingStartTransaction - another resolver recorded the start first, so the conflict is swallowed',
    stored: DEPOSIT_IN_STATE.AwaitingStartTransaction,
    transaction: { circuit: 'startDeposit', rows: [start(succeeded)] },
    controller: {
      recordStarted: async () => {
        throw new DepositStateConflict(DEPOSIT_NAME, 'AwaitingVaultRequest', 'recordStarted')
      },
    },
    expectTransitions: [],
    expectWrites: 1,
  },
  {
    name: 'AwaitingVaultRequest - no request row yet',
    stored: DEPOSIT_IN_STATE.AwaitingVaultRequest,
    requests: [],
    expectTransitions: [],
  },
  {
    name: 'AwaitingVaultRequest - the request is still being processed',
    stored: DEPOSIT_IN_STATE.AwaitingVaultRequest,
    requests: [VAULT_REQUEST_IN_STATE.AwaitingAttestation],
    expectTransitions: [],
  },
  {
    name: 'AwaitingVaultRequest - the request is attested, so the deposit awaits completion',
    stored: DEPOSIT_IN_STATE.AwaitingVaultRequest,
    requests: [attested],
    expectTransitions: [{ method: 'recordAttested', args: { name: DEPOSIT_NAME } }],
  },
  {
    name: "AwaitingCompletion - no complete attempt and the request still on the ledger: the caller's to-do",
    stored: DEPOSIT_IN_STATE.AwaitingCompletion,
    transaction: { circuit: 'completeDeposit', rows: [] },
    requests: [attested],
    ledger: requestLedgerAt('attestationFlushed'),
    expectTransitions: [],
  },
  {
    name: 'AwaitingCompletion - a live complete attempt, so nothing is read or written',
    stored: DEPOSIT_IN_STATE.AwaitingCompletion,
    transaction: { circuit: 'completeDeposit', rows: [complete({ state: 'AwaitingWallet' })] },
    expectTransitions: [],
  },
  {
    name: 'AwaitingCompletion - a complete recorded as rejected whose request the ledger settled: minted',
    stored: DEPOSIT_IN_STATE.AwaitingCompletion,
    transaction: { circuit: 'completeDeposit', rows: [complete(rejected)] },
    requests: [attested],
    ledger: requestLedgerAt('settled'),
    expectTransitions: [
      { method: 'recordCompleted', args: { name: DEPOSIT_NAME, outcome: 'minted' } },
    ],
  },
  {
    name: 'AwaitingCompletion - no complete attempt here yet the ledger settled the request: completed by another client',
    stored: DEPOSIT_IN_STATE.AwaitingCompletion,
    transaction: { circuit: 'completeDeposit', rows: [] },
    requests: [{ ...attested, attestationOutput: '00' }],
    ledger: requestLedgerAt('settled'),
    expectTransitions: [
      { method: 'recordCompleted', args: { name: DEPOSIT_NAME, outcome: 'closed' } },
    ],
  },
  {
    name: 'AwaitingCompletion - the ledger settled the request but no request row exists, which is an error',
    stored: DEPOSIT_IN_STATE.AwaitingCompletion,
    transaction: { circuit: 'completeDeposit', rows: [] },
    requests: [],
    expectTransitions: [],
    expectError: 'has no vault request to complete',
  },
  {
    name: 'AwaitingCompleteTransaction - no complete transaction found',
    stored: DEPOSIT_IN_STATE.AwaitingCompleteTransaction,
    transaction: { circuit: 'completeDeposit', rows: [] },
    expectTransitions: [],
  },
  {
    name: 'AwaitingCompleteTransaction - the complete transaction is still live',
    stored: DEPOSIT_IN_STATE.AwaitingCompleteTransaction,
    transaction: { circuit: 'completeDeposit', rows: [complete({ state: 'AwaitingWallet' })] },
    expectTransitions: [],
  },
  {
    name: 'AwaitingCompleteTransaction - succeeded over an executed transfer that returned true: minted',
    stored: DEPOSIT_IN_STATE.AwaitingCompleteTransaction,
    transaction: { circuit: 'completeDeposit', rows: [complete(succeeded)] },
    requests: [attested],
    expectTransitions: [
      { method: 'recordCompleted', args: { name: DEPOSIT_NAME, outcome: 'minted' } },
    ],
  },
  {
    name: 'AwaitingCompleteTransaction - succeeded over an executed transfer that returned false: closed',
    stored: DEPOSIT_IN_STATE.AwaitingCompleteTransaction,
    transaction: { circuit: 'completeDeposit', rows: [complete(succeeded)] },
    requests: [{ ...attested, attestationOutput: '00' }],
    expectTransitions: [
      { method: 'recordCompleted', args: { name: DEPOSIT_NAME, outcome: 'closed' } },
    ],
  },
  {
    name: 'AwaitingCompleteTransaction - succeeded over a failed sweep: closed',
    stored: DEPOSIT_IN_STATE.AwaitingCompleteTransaction,
    transaction: { circuit: 'completeDeposit', rows: [complete(succeeded)] },
    requests: [{ ...attested, attestationOutputKind: 'failed', attestationOutput: '' }],
    expectTransitions: [
      { method: 'recordCompleted', args: { name: DEPOSIT_NAME, outcome: 'closed' } },
    ],
  },
  {
    name: 'AwaitingCompleteTransaction - succeeded over an unviable sweep: closed',
    stored: DEPOSIT_IN_STATE.AwaitingCompleteTransaction,
    transaction: { circuit: 'completeDeposit', rows: [complete(succeeded)] },
    requests: [{ ...attested, attestationOutputKind: 'unviable', attestationOutput: '' }],
    expectTransitions: [
      { method: 'recordCompleted', args: { name: DEPOSIT_NAME, outcome: 'closed' } },
    ],
  },
  {
    name: 'AwaitingCompleteTransaction - succeeded without a request row is an error',
    stored: DEPOSIT_IN_STATE.AwaitingCompleteTransaction,
    transaction: { circuit: 'completeDeposit', rows: [complete(succeeded)] },
    requests: [],
    expectTransitions: [],
    expectError: 'has no vault request to complete',
  },
  {
    name: 'AwaitingCompleteTransaction - the complete transaction failed and the ledger still holds the request, so the caller may try again',
    stored: DEPOSIT_IN_STATE.AwaitingCompleteTransaction,
    transaction: { circuit: 'completeDeposit', rows: [complete(failed)] },
    requests: [attested],
    ledger: requestLedgerAt('attestationFlushed'),
    expectTransitions: [{ method: 'recordCompleteFailure', args: { name: DEPOSIT_NAME } }],
  },
  {
    name: 'AwaitingCompleteTransaction - the complete transaction was recorded as rejected but the ledger settled the request: minted',
    stored: DEPOSIT_IN_STATE.AwaitingCompleteTransaction,
    transaction: { circuit: 'completeDeposit', rows: [complete(rejected)] },
    requests: [attested],
    ledger: requestLedgerAt('settled'),
    expectTransitions: [
      { method: 'recordCompleted', args: { name: DEPOSIT_NAME, outcome: 'minted' } },
    ],
  },
  {
    name: 'AwaitingCompleteTransaction - the complete transaction failed and no request row exists, which is an error',
    stored: DEPOSIT_IN_STATE.AwaitingCompleteTransaction,
    transaction: { circuit: 'completeDeposit', rows: [complete(failed)] },
    requests: [],
    expectTransitions: [],
    expectError: 'has no vault request to complete',
  },
  {
    name: 'Completed - nothing is read or written',
    stored: DEPOSIT_IN_STATE.Completed,
    expectTransitions: [],
  },
  {
    name: 'Failed - nothing is read or written',
    stored: DEPOSIT_IN_STATE.Failed,
    expectTransitions: [],
  },
  {
    name: 'a missing deposit is left alone',
    stored: undefined,
    expectTransitions: [],
  },
]

function resolverOver(doubles: Doubles): DepositStateResolverImpl {
  const recording = (method: string) => async (args: object) => {
    doubles.transitions.push({ method, args })
    return doubles.stored ?? depositFixture()
  }
  return new DepositStateResolverImpl(
    mock<DepositRepository>('DepositRepository', {
      get: async (name) => {
        expect(name).toBe(DEPOSIT_NAME)
        return doubles.stored
      },
      ...doubles.repository,
    }),
    mock<DepositStateController>('DepositStateController', {
      recordStarted: recording('recordStarted'),
      recordStartFailure: recording('recordStartFailure'),
      recordAttested: recording('recordAttested'),
      recordCompleted: recording('recordCompleted'),
      recordCompleteFailure: recording('recordCompleteFailure'),
      ...doubles.controller,
    }),
    mock<MidnightTransactionRepository>('MidnightTransactionRepository', {
      ...(doubles.transaction === undefined
        ? {}
        : {
            search: async (args) => {
              expect(args).toEqual({
                criteria: [
                  { type: 'exact-text', field: 'parent', text: doubles.stored?.name },
                  { type: 'exact-text', field: 'circuit', text: doubles.transaction?.circuit },
                ],
                order: { field: 'createTime', direction: 'desc' },
                limit: 1,
              })
              return doubles.transaction?.rows ?? []
            },
          }),
    }),
    mock<VaultRequestRepository>('VaultRequestRepository', {
      ...(doubles.requests === undefined
        ? {}
        : {
            search: async (args) => {
              expect(args).toEqual({
                criteria: [{ type: 'exact-text', field: 'parent', text: doubles.stored?.name }],
                order: { field: 'createTime', direction: 'desc' },
                limit: 1,
              })
              return doubles.requests ?? []
            },
          }),
    }),
    mock<RequestLedger>(
      'RequestLedger',
      doubles.ledger === undefined
        ? {}
        : {
            state: async () => {
              doubles.counts.ledgerReads += 1
              return doubles.ledger ?? requestLedgerAt('settled')
            },
          },
    ),
    mock<UnitOfWork>('UnitOfWork', {
      runInTransaction: (work) => {
        doubles.counts.writes += 1
        return work()
      },
    }),
  )
}

describe('DepositStateResolverImpl.resolveDeposit', () => {
  test.each(cases)('$name', async ({ expectTransitions, expectWrites, expectError, ...rest }) => {
    const doubles: Doubles = { ...rest, transitions: [], counts: { writes: 0, ledgerReads: 0 } }
    const resolving = resolverOver(doubles).resolveDeposit({ name: DEPOSIT_NAME })
    if (expectError === undefined) await resolving
    else await expect(resolving).rejects.toThrow(expectError)
    expect(doubles.transitions).toEqual(expectTransitions)
    expect(doubles.counts.writes).toBe(expectWrites ?? expectTransitions.length)
    expect(doubles.counts.ledgerReads).toBe(rest.ledger === undefined ? 0 : 1)
  })
})

describe('DepositStateResolverImpl.resolvePending', () => {
  const second = depositFixture({
    name: DEPOSIT_NAME.replace(/[0-9a-f]{12}$/, '0a1b2c3d4e5f'),
    state: 'AwaitingVaultRequest',
  })

  function searching(rowsByState: Partial<Record<DepositState, Deposit[]>>) {
    const searched: string[] = []
    const repository: Partial<DepositRepository> = {
      search: async (args) => {
        const [criterion] = args.criteria
        if (criterion?.type !== 'exact-text' || criterion.field !== 'state') {
          throw new Error(`unexpected search ${JSON.stringify(args)}`)
        }
        searched.push(criterion.text)
        expect(args.order).toEqual({ field: 'createTime', direction: 'asc' })
        return rowsByState[depositStateSchema.parse(criterion.text)] ?? []
      },
    }
    return { searched, repository }
  }

  test('sweeps every waiting state in order and resolves each row, reading no ledger when none needs it', async () => {
    const { searched, repository } = searching({
      AwaitingVaultRequest: [DEPOSIT_IN_STATE.AwaitingVaultRequest, second],
    })
    const transitions: Transition[] = []
    const resolver = new DepositStateResolverImpl(
      mock<DepositRepository>('DepositRepository', repository),
      mock<DepositStateController>('DepositStateController', {
        recordAttested: async (args) => {
          transitions.push({ method: 'recordAttested', args })
          return second
        },
      }),
      mock<MidnightTransactionRepository>('MidnightTransactionRepository'),
      mock<VaultRequestRepository>('VaultRequestRepository', {
        search: async (args) => {
          const [criterion] = args.criteria
          if (criterion?.type !== 'exact-text') throw new Error('unexpected search')
          return criterion.text === second.name ? [attested] : []
        },
      }),
      mock<RequestLedger>('RequestLedger'),
      mock<UnitOfWork>('UnitOfWork', { runInTransaction: (work) => work() }),
    )
    await resolver.resolvePending()
    expect(searched).toEqual([
      'AwaitingStartTransaction',
      'AwaitingVaultRequest',
      'AwaitingCompletion',
      'AwaitingCompleteTransaction',
    ])
    expect(transitions).toEqual([{ method: 'recordAttested', args: { name: second.name } }])
  })

  test('one ledger read serves every deposit of the sweep that needs one', async () => {
    const { repository } = searching({
      AwaitingCompletion: [
        DEPOSIT_IN_STATE.AwaitingCompletion,
        { ...second, state: 'AwaitingCompletion' },
      ],
    })
    const transitions: Transition[] = []
    let ledgerReads = 0
    const resolver = new DepositStateResolverImpl(
      mock<DepositRepository>('DepositRepository', repository),
      mock<DepositStateController>('DepositStateController', {
        recordCompleted: async (args) => {
          transitions.push({ method: 'recordCompleted', args })
          return second
        },
      }),
      mock<MidnightTransactionRepository>('MidnightTransactionRepository', {
        search: async () => [],
      }),
      mock<VaultRequestRepository>('VaultRequestRepository', {
        search: async (args) => {
          const [criterion] = args.criteria
          if (criterion?.type !== 'exact-text') throw new Error('unexpected search')
          return [{ ...attested, parent: criterion.text }]
        },
      }),
      mock<RequestLedger>('RequestLedger', {
        state: async () => {
          ledgerReads += 1
          return requestLedgerAt('settled')
        },
      }),
      mock<UnitOfWork>('UnitOfWork', { runInTransaction: (work) => work() }),
    )
    await resolver.resolvePending()
    expect(ledgerReads).toBe(1)
    expect(transitions).toEqual([
      { method: 'recordCompleted', args: { name: DEPOSIT_NAME, outcome: 'minted' } },
      { method: 'recordCompleted', args: { name: second.name, outcome: 'minted' } },
    ])
  })

  test("one row's failure is logged and the next row still resolves", async () => {
    const { repository } = searching({
      AwaitingStartTransaction: [
        DEPOSIT_IN_STATE.AwaitingStartTransaction,
        { ...second, state: 'AwaitingStartTransaction' },
      ],
    })
    const transitions: Transition[] = []
    let searches = 0
    const resolver = new DepositStateResolverImpl(
      mock<DepositRepository>('DepositRepository', repository),
      mock<DepositStateController>('DepositStateController', {
        recordStarted: async (args) => {
          transitions.push({ method: 'recordStarted', args })
          return second
        },
      }),
      mock<MidnightTransactionRepository>('MidnightTransactionRepository', {
        search: async () => {
          searches += 1
          if (searches === 1) throw new Error('database gone')
          return [start(succeeded)]
        },
      }),
      mock<VaultRequestRepository>('VaultRequestRepository'),
      mock<RequestLedger>('RequestLedger'),
      mock<UnitOfWork>('UnitOfWork', { runInTransaction: (work) => work() }),
    )
    await resolver.resolvePending()
    expect(transitions).toEqual([{ method: 'recordStarted', args: { name: second.name } }])
  })
})
