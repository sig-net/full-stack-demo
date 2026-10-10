import { describe, expect, test, vi } from 'vitest'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
import {
  type EthereumTransaction,
  ethereumTransactionStateSchema,
  type EthereumTransactionState,
} from '@/lib/ethereum/transaction-v1/transaction'
import {
  SIGNED_TRANSACTION,
  SIGNED_TX,
  TRANSACTION_IN_STATE,
  TRANSACTION_NAME,
  transactionFixture,
  TX_HASH,
} from '@/lib/ethereum/transaction-v1/transaction-fixtures'
import type {
  EthereumLedgerTransactionStatus,
  EthereumTransactionLedger,
  LedgerStatusArgs,
} from '@/lib/ethereum/transaction-v1/transaction-ledger'
import type { EthereumTransactionRepository } from '@/lib/ethereum/transaction-v1/transaction-repository'
import {
  EthereumTransactionStateConflict,
  type EthereumTransactionStateController,
} from '@/lib/ethereum/transaction-v1/transaction-state-controller'
import { EthereumTransactionStateResolverImpl } from '@/lib/ethereum/transaction-v1/transaction-state-resolver-impl'
import { mock } from '@/lib/testing/mock'

/** Which controller method a resolve ended in, with its args. */
type Transition = { method: string; args: object }

interface Case {
  name: string
  stored: EthereumTransaction | undefined
  ledger: Partial<EthereumTransactionLedger>
  controller?: (transitions: Transition[]) => Partial<EthereumTransactionStateController>
  expectTransitions: Transition[]
  expectWrites?: number
  expectError?: string
}

const EXPIRED = new Date('2000-01-01T00:00:00Z')

/** The chain is asked about the hash with the sender and nonce the signed bytes carry. */
function statusAnswering(status: EthereumLedgerTransactionStatus) {
  return async (args: LedgerStatusArgs): Promise<EthereumLedgerTransactionStatus> => {
    expect(args).toEqual({
      txHash: TX_HASH,
      from: SIGNED_TRANSACTION.from,
      nonce: SIGNED_TRANSACTION.nonce,
    })
    return status
  }
}

const cases: Case[] = [
  {
    name: 'AwaitingSubmission - broadcasts outside the transaction and records the hash inside one',
    stored: TRANSACTION_IN_STATE.AwaitingSubmission,
    ledger: {
      broadcast: async (signedTx) => {
        expect(signedTx).toBe(SIGNED_TX)
        return TX_HASH
      },
    },
    expectTransitions: [
      { method: 'recordSubmission', args: { name: TRANSACTION_NAME, txHash: TX_HASH } },
    ],
  },
  {
    name: 'AwaitingSubmission - the node refuses the bytes, so the rejection is recorded',
    stored: TRANSACTION_IN_STATE.AwaitingSubmission,
    ledger: {
      broadcast: async () => {
        throw new Error('insufficient funds for gas * price + value')
      },
    },
    expectTransitions: [
      {
        method: 'recordRejection',
        args: { name: TRANSACTION_NAME, error: 'insufficient funds for gas * price + value' },
      },
    ],
  },
  {
    name: 'AwaitingSubmission - another resolver got there first, so the conflict is swallowed',
    stored: TRANSACTION_IN_STATE.AwaitingSubmission,
    ledger: { broadcast: async () => TX_HASH },
    controller: () => ({
      recordSubmission: async () => {
        throw new EthereumTransactionStateConflict(
          TRANSACTION_NAME,
          'AwaitingInclusion',
          'recordSubmission',
        )
      },
    }),
    expectTransitions: [],
    expectWrites: 1,
  },
  {
    name: 'AwaitingInclusion - still pending on the chain, nothing recorded',
    stored: TRANSACTION_IN_STATE.AwaitingInclusion,
    ledger: { status: statusAnswering({ outcome: 'pending' }) },
    expectTransitions: [],
  },
  {
    name: 'AwaitingInclusion - mined, so the success is recorded with its block',
    stored: TRANSACTION_IN_STATE.AwaitingInclusion,
    ledger: { status: statusAnswering({ outcome: 'mined', blockNumber: 12n }) },
    expectTransitions: [
      { method: 'recordSuccess', args: { name: TRANSACTION_NAME, blockNumber: 12n } },
    ],
  },
  {
    name: 'AwaitingInclusion - reverted on chain, so the failure is recorded with its block',
    stored: TRANSACTION_IN_STATE.AwaitingInclusion,
    ledger: { status: statusAnswering({ outcome: 'reverted', blockNumber: 12n }) },
    expectTransitions: [
      {
        method: 'recordFailure',
        args: { name: TRANSACTION_NAME, failure: 'Reverted', blockNumber: 12n },
      },
    ],
  },
  {
    name: 'AwaitingInclusion - the nonce went to another transaction',
    stored: TRANSACTION_IN_STATE.AwaitingInclusion,
    ledger: { status: statusAnswering({ outcome: 'nonceConsumed' }) },
    expectTransitions: [
      { method: 'recordFailure', args: { name: TRANSACTION_NAME, failure: 'NonceConsumed' } },
    ],
  },
  {
    name: 'AwaitingInclusion - the node is unreachable, so nothing is recorded and the error surfaces',
    stored: TRANSACTION_IN_STATE.AwaitingInclusion,
    ledger: {
      status: async () => {
        throw new Error('connect ECONNREFUSED')
      },
    },
    expectTransitions: [],
    expectError: 'connect ECONNREFUSED',
  },
  {
    name: 'any waiting state past its expiry expires before any work',
    stored: transactionFixture({ expireTime: EXPIRED }),
    ledger: {},
    expectTransitions: [{ method: 'expireTransaction', args: { name: TRANSACTION_NAME } }],
  },
  {
    name: 'a terminal transaction past its expiry is left alone',
    stored: { ...TRANSACTION_IN_STATE.Succeeded, expireTime: EXPIRED },
    ledger: {},
    expectTransitions: [],
  },
  {
    name: 'a missing transaction is ignored',
    stored: undefined,
    ledger: {},
    expectTransitions: [],
  },
]

describe('EthereumTransactionStateResolverImpl.resolveTransaction', () => {
  test.each(cases)(
    '$name',
    async ({ stored, ledger, controller, expectTransitions, expectWrites, expectError }) => {
      const transitions: Transition[] = []
      let writes = 0
      const recording = (method: string) => async (args: object) => {
        transitions.push({ method, args })
        return stored ?? transactionFixture()
      }
      const resolver = new EthereumTransactionStateResolverImpl(
        mock<EthereumTransactionRepository>('EthereumTransactionRepository', {
          get: async (name) => {
            expect(name).toBe(TRANSACTION_NAME)
            return stored
          },
        }),
        mock<EthereumTransactionStateController>('EthereumTransactionStateController', {
          recordSubmission: recording('recordSubmission'),
          recordSuccess: recording('recordSuccess'),
          recordFailure: recording('recordFailure'),
          recordRejection: recording('recordRejection'),
          expireTransaction: recording('expireTransaction'),
          ...controller?.(transitions),
        }),
        mock<EthereumTransactionLedger>('EthereumTransactionLedger', ledger),
        mock<UnitOfWork>('UnitOfWork', {
          runInTransaction: (work) => {
            writes += 1
            return work()
          },
        }),
      )
      const resolving = resolver.resolveTransaction({ name: TRANSACTION_NAME })
      if (expectError === undefined) await resolving
      else await expect(resolving).rejects.toThrow(expectError)
      expect(transitions).toEqual(expectTransitions)
      expect(writes).toBe(expectWrites ?? expectTransitions.length)
    },
  )
})

/** A sweep over the rows each state holds, with the chain's answers scripted in order. */
interface SweepCase {
  name: string
  rows: Partial<Record<EthereumTransactionState, EthereumTransaction[]>>
  /** What each `status` read answers, in order: a status, or the error it throws. */
  statuses: (EthereumLedgerTransactionStatus | Error)[]
  expectTransitions: Transition[]
  expectLogged: number
}

const SECOND_NAME = TRANSACTION_NAME.replace(/[0-9a-f]{12}$/, '0a1b2c3d4e5f')

const sweepCases: SweepCase[] = [
  {
    name: 'sweeps every waiting state in order and resolves each row, oldest first',
    rows: {
      AwaitingInclusion: [
        TRANSACTION_IN_STATE.AwaitingInclusion,
        { ...TRANSACTION_IN_STATE.AwaitingInclusion, name: SECOND_NAME },
      ],
    },
    statuses: [
      { outcome: 'mined', blockNumber: 12n },
      { outcome: 'mined', blockNumber: 13n },
    ],
    expectTransitions: [
      { method: 'recordSuccess', args: { name: TRANSACTION_NAME, blockNumber: 12n } },
      { method: 'recordSuccess', args: { name: SECOND_NAME, blockNumber: 13n } },
    ],
    expectLogged: 0,
  },
  {
    name: 'a waiting row past its expiry is expired by the sweep',
    rows: {
      AwaitingSubmission: [{ ...TRANSACTION_IN_STATE.AwaitingSubmission, expireTime: EXPIRED }],
    },
    statuses: [],
    expectTransitions: [{ method: 'expireTransaction', args: { name: TRANSACTION_NAME } }],
    expectLogged: 0,
  },
  {
    name: "one row's failure is logged and the next row still resolves",
    rows: {
      AwaitingInclusion: [
        TRANSACTION_IN_STATE.AwaitingInclusion,
        { ...TRANSACTION_IN_STATE.AwaitingInclusion, name: SECOND_NAME },
      ],
    },
    statuses: [new Error('connect ECONNREFUSED'), { outcome: 'mined', blockNumber: 13n }],
    expectTransitions: [{ method: 'recordSuccess', args: { name: SECOND_NAME, blockNumber: 13n } }],
    expectLogged: 1,
  },
  {
    name: 'nothing waiting reads no chain and writes nothing',
    rows: {},
    statuses: [],
    expectTransitions: [],
    expectLogged: 0,
  },
]

describe('EthereumTransactionStateResolverImpl.resolvePending', () => {
  test.each(sweepCases)('$name', async ({ rows, statuses, expectTransitions, expectLogged }) => {
    const searched: string[] = []
    const transitions: Transition[] = []
    const scripted = [...statuses]
    const recording = (method: string) => async (args: object) => {
      transitions.push({ method, args })
      return transactionFixture()
    }
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const resolver = new EthereumTransactionStateResolverImpl(
        mock<EthereumTransactionRepository>('EthereumTransactionRepository', {
          search: async (args) => {
            const [criterion] = args.criteria
            if (criterion?.type !== 'exact-text' || criterion.field !== 'state') {
              throw new Error(`unexpected search ${JSON.stringify(args)}`)
            }
            searched.push(criterion.text)
            expect(args.order).toEqual({ field: 'createTime', direction: 'asc' })
            return rows[ethereumTransactionStateSchema.parse(criterion.text)] ?? []
          },
        }),
        mock<EthereumTransactionStateController>('EthereumTransactionStateController', {
          recordSuccess: recording('recordSuccess'),
          expireTransaction: recording('expireTransaction'),
        }),
        mock<EthereumTransactionLedger>('EthereumTransactionLedger', {
          status: async () => {
            const answer = scripted.shift()
            if (answer === undefined) throw new Error('the chain was read more often than scripted')
            if (answer instanceof Error) throw answer
            return answer
          },
        }),
        mock<UnitOfWork>('UnitOfWork', { runInTransaction: (work) => work() }),
      )
      await resolver.resolvePending()
      expect(searched).toEqual(['AwaitingSubmission', 'AwaitingInclusion'])
      expect(transitions).toEqual(expectTransitions)
      expect(scripted).toEqual([])
      expect(logged).toHaveBeenCalledTimes(expectLogged)
    } finally {
      logged.mockRestore()
    }
  })
})
