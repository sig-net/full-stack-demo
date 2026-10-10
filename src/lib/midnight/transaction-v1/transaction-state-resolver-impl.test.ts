import { describe, expect, test, vi } from 'vitest'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
import {
  type MidnightTransaction,
  midnightTransactionStateSchema,
  type MidnightTransactionState,
} from '@/lib/midnight/transaction-v1/transaction'
import {
  TRANSACTION_IN_STATE,
  TRANSACTION_NAME,
  transactionFixture,
} from '@/lib/midnight/transaction-v1/transaction-fixtures'
import type {
  MidnightLedgerTransactionStatus,
  MidnightTransactionLedger,
} from '@/lib/midnight/transaction-v1/transaction-ledger'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import {
  MidnightTransactionStateConflict,
  type MidnightTransactionStateController,
} from '@/lib/midnight/transaction-v1/transaction-state-controller'
import { MidnightTransactionStateResolverImpl } from '@/lib/midnight/transaction-v1/transaction-state-resolver-impl'
import type { RelayerWallet } from '@/lib/midnight/wallet/relayer-wallet'
import { mock } from '@/lib/testing/mock'

/** Which controller method a resolve ended in, with its args. */
type Transition = { method: string; args: object }

interface Case {
  name: string
  stored: MidnightTransaction | undefined
  ledger: Partial<MidnightTransactionLedger>
  relayerWallet?: Partial<RelayerWallet>
  controller?: (transitions: Transition[]) => Partial<MidnightTransactionStateController>
  expectTransitions: Transition[]
  expectWrites?: number
  expectError?: string
}

const EXPIRED = new Date('2000-01-01T00:00:00Z')

const cases: Case[] = [
  {
    name: 'AwaitingProof - proves outside the transaction and records the proof inside one',
    stored: TRANSACTION_IN_STATE.AwaitingProof,
    ledger: { prove: async (unprovenTx) => `proven(${unprovenTx})` },
    expectTransitions: [
      { method: 'recordProof', args: { name: TRANSACTION_NAME, unboundTx: 'proven(unproven)' } },
    ],
  },
  {
    name: 'AwaitingProof - the proof server fails, so the failure is recorded',
    stored: TRANSACTION_IN_STATE.AwaitingProof,
    ledger: {
      prove: async () => {
        throw new Error('proof server unreachable')
      },
    },
    expectTransitions: [
      {
        method: 'recordProofFailure',
        args: { name: TRANSACTION_NAME, error: 'proof server unreachable' },
      },
    ],
  },
  {
    name: 'AwaitingProof - another resolver got there first, so the conflict is swallowed',
    stored: TRANSACTION_IN_STATE.AwaitingProof,
    ledger: { prove: async () => 'proven' },
    controller: () => ({
      recordProof: async () => {
        throw new MidnightTransactionStateConflict(
          TRANSACTION_NAME,
          'AwaitingWallet',
          'recordProof',
        )
      },
    }),
    expectTransitions: [],
    expectWrites: 1,
  },
  {
    name: 'AwaitingWallet - a caller transaction is left for the browser wallet',
    stored: TRANSACTION_IN_STATE.AwaitingWallet,
    ledger: {},
    expectTransitions: [],
  },
  {
    name: 'AwaitingWallet - a relayer transaction is finalised by the relayer wallet and submitted',
    stored: { ...TRANSACTION_IN_STATE.AwaitingWallet, signer: 'relayer' },
    ledger: {},
    relayerWallet: { finalize: async (unboundTx) => `finalized(${unboundTx})` },
    expectTransitions: [
      {
        method: 'submitTransaction',
        args: { name: TRANSACTION_NAME, finalizedTx: 'finalized(unbound)' },
      },
    ],
  },
  {
    name: 'AwaitingWallet - the relayer wallet fails, so nothing is recorded and the error surfaces',
    stored: { ...TRANSACTION_IN_STATE.AwaitingWallet, signer: 'relayer' },
    ledger: {},
    relayerWallet: {
      finalize: async () => {
        throw new Error('wallet not synced')
      },
    },
    expectTransitions: [],
    expectError: 'wallet not synced',
  },
  {
    name: 'AwaitingSubmission - submits and records the id the node returned',
    stored: TRANSACTION_IN_STATE.AwaitingSubmission,
    ledger: { submit: async (finalizedTx) => `id(${finalizedTx})` },
    expectTransitions: [
      { method: 'recordSubmission', args: { name: TRANSACTION_NAME, txId: 'id(finalized)' } },
    ],
  },
  {
    name: 'AwaitingSubmission - the node refuses the bytes',
    stored: TRANSACTION_IN_STATE.AwaitingSubmission,
    ledger: {
      submit: async () => {
        throw new Error('invalid transaction')
      },
    },
    expectTransitions: [
      {
        method: 'recordRejection',
        args: { name: TRANSACTION_NAME, error: 'invalid transaction' },
      },
    ],
  },
  {
    name: 'AwaitingInclusion - still pending on the ledger, nothing recorded',
    stored: TRANSACTION_IN_STATE.AwaitingInclusion,
    ledger: {
      status: async (): Promise<MidnightLedgerTransactionStatus> => ({ outcome: 'pending' }),
    },
    expectTransitions: [],
  },
  {
    name: 'AwaitingInclusion - succeeded on the ledger',
    stored: TRANSACTION_IN_STATE.AwaitingInclusion,
    ledger: {
      status: async (): Promise<MidnightLedgerTransactionStatus> => ({ outcome: 'succeeded' }),
    },
    expectTransitions: [{ method: 'recordSuccess', args: { name: TRANSACTION_NAME } }],
  },
  {
    name: 'AwaitingInclusion - failed on the ledger',
    stored: TRANSACTION_IN_STATE.AwaitingInclusion,
    ledger: {
      status: async (): Promise<MidnightLedgerTransactionStatus> => ({
        outcome: 'failed',
        failure: 'FailEntirely',
        error: 'rejected',
      }),
    },
    expectTransitions: [
      {
        method: 'recordLedgerFailure',
        args: { name: TRANSACTION_NAME, failure: 'FailEntirely', error: 'rejected' },
      },
    ],
  },
  {
    name: 'any waiting state past its TTL expires before any work',
    stored: transactionFixture({ expireTime: EXPIRED }),
    ledger: {},
    expectTransitions: [{ method: 'expireTransaction', args: { name: TRANSACTION_NAME } }],
  },
  {
    name: 'a terminal transaction past its TTL is left alone',
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

describe('MidnightTransactionStateResolverImpl.resolveTransaction', () => {
  test.each(cases)(
    '$name',
    async ({
      stored,
      ledger,
      relayerWallet,
      controller,
      expectTransitions,
      expectWrites,
      expectError,
    }) => {
      const transitions: Transition[] = []
      let writes = 0
      const recording = (method: string) => async (args: object) => {
        transitions.push({ method, args })
        return stored ?? transactionFixture()
      }
      const resolver = new MidnightTransactionStateResolverImpl(
        mock<MidnightTransactionRepository>('MidnightTransactionRepository', {
          get: async (name) => {
            expect(name).toBe(TRANSACTION_NAME)
            return stored
          },
        }),
        mock<MidnightTransactionStateController>('MidnightTransactionStateController', {
          recordProof: recording('recordProof'),
          recordProofFailure: recording('recordProofFailure'),
          recordSubmission: recording('recordSubmission'),
          recordRejection: recording('recordRejection'),
          recordLedgerFailure: recording('recordLedgerFailure'),
          recordSuccess: recording('recordSuccess'),
          submitTransaction: recording('submitTransaction'),
          expireTransaction: recording('expireTransaction'),
          ...controller?.(transitions),
        }),
        mock<MidnightTransactionLedger>('MidnightTransactionLedger', ledger),
        mock<RelayerWallet>('RelayerWallet', relayerWallet),
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

/** A sweep over the rows each state holds, with the ledger's answers scripted in order. */
interface SweepCase {
  name: string
  rows: Partial<Record<MidnightTransactionState, MidnightTransaction[]>>
  /** What each `status` read answers, in order: a status, or the error it throws. */
  statuses: (MidnightLedgerTransactionStatus | Error)[]
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
    statuses: [{ outcome: 'succeeded' }, { outcome: 'succeeded' }],
    expectTransitions: [
      { method: 'recordSuccess', args: { name: TRANSACTION_NAME } },
      { method: 'recordSuccess', args: { name: SECOND_NAME } },
    ],
    expectLogged: 0,
  },
  {
    name: 'a waiting row past its TTL is expired by the sweep',
    rows: { AwaitingWallet: [{ ...TRANSACTION_IN_STATE.AwaitingWallet, expireTime: EXPIRED }] },
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
    statuses: [new Error('indexer unreachable'), { outcome: 'succeeded' }],
    expectTransitions: [{ method: 'recordSuccess', args: { name: SECOND_NAME } }],
    expectLogged: 1,
  },
  {
    name: 'nothing waiting reads no ledger and writes nothing',
    rows: {},
    statuses: [],
    expectTransitions: [],
    expectLogged: 0,
  },
]

describe('MidnightTransactionStateResolverImpl.resolvePending', () => {
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
      const resolver = new MidnightTransactionStateResolverImpl(
        mock<MidnightTransactionRepository>('MidnightTransactionRepository', {
          search: async (args) => {
            const [criterion] = args.criteria
            if (criterion?.type !== 'exact-text' || criterion.field !== 'state') {
              throw new Error(`unexpected search ${JSON.stringify(args)}`)
            }
            searched.push(criterion.text)
            expect(args.order).toEqual({ field: 'createTime', direction: 'asc' })
            return rows[midnightTransactionStateSchema.parse(criterion.text)] ?? []
          },
        }),
        mock<MidnightTransactionStateController>('MidnightTransactionStateController', {
          recordSuccess: recording('recordSuccess'),
          expireTransaction: recording('expireTransaction'),
        }),
        mock<MidnightTransactionLedger>('MidnightTransactionLedger', {
          status: async () => {
            const answer = scripted.shift()
            if (answer === undefined)
              throw new Error('the ledger was read more often than scripted')
            if (answer instanceof Error) throw answer
            return answer
          },
        }),
        mock<RelayerWallet>('RelayerWallet'),
        mock<UnitOfWork>('UnitOfWork', { runInTransaction: (work) => work() }),
      )
      await resolver.resolvePending()
      expect(searched).toEqual([
        'AwaitingProof',
        'AwaitingWallet',
        'AwaitingSubmission',
        'AwaitingInclusion',
      ])
      expect(transitions).toEqual(expectTransitions)
      expect(scripted).toEqual([])
      expect(logged).toHaveBeenCalledTimes(expectLogged)
    } finally {
      logged.mockRestore()
    }
  })
})
