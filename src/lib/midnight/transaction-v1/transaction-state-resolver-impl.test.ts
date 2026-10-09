import { describe, expect, test } from 'vitest'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import {
  TRANSACTION_IN_STATE,
  TRANSACTION_NAME,
  transactionFixture,
} from '@/lib/midnight/transaction-v1/transaction-fixtures'
import type {
  LedgerTransactionStatus,
  TransactionLedger,
} from '@/lib/midnight/transaction-v1/transaction-ledger'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import {
  TransactionStateConflict,
  type TransactionStateController,
} from '@/lib/midnight/transaction-v1/transaction-state-controller'
import { TransactionStateResolverImpl } from '@/lib/midnight/transaction-v1/transaction-state-resolver-impl'
import { mock } from '@/lib/testing/mock'

/** Which controller method a resolve ended in, with its args. */
type Transition = { method: string; args: object }

interface Case {
  name: string
  stored: MidnightTransaction | undefined
  ledger: Partial<TransactionLedger>
  controller?: (transitions: Transition[]) => Partial<TransactionStateController>
  expectTransitions: Transition[]
  expectWrites?: number
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
        throw new TransactionStateConflict(TRANSACTION_NAME, 'AwaitingWallet', 'recordProof')
      },
    }),
    expectTransitions: [],
    expectWrites: 1,
  },
  {
    name: 'AwaitingWallet - nothing to do, the user holds the next step',
    stored: TRANSACTION_IN_STATE.AwaitingWallet,
    ledger: {},
    expectTransitions: [],
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
        args: { name: TRANSACTION_NAME, failure: 'Rejected', error: 'invalid transaction' },
      },
    ],
  },
  {
    name: 'AwaitingInclusion - still pending on the ledger, nothing recorded',
    stored: TRANSACTION_IN_STATE.AwaitingInclusion,
    ledger: { status: async (): Promise<LedgerTransactionStatus> => ({ outcome: 'pending' }) },
    expectTransitions: [],
  },
  {
    name: 'AwaitingInclusion - succeeded on the ledger',
    stored: TRANSACTION_IN_STATE.AwaitingInclusion,
    ledger: { status: async (): Promise<LedgerTransactionStatus> => ({ outcome: 'succeeded' }) },
    expectTransitions: [{ method: 'recordSuccess', args: { name: TRANSACTION_NAME } }],
  },
  {
    name: 'AwaitingInclusion - failed on the ledger',
    stored: TRANSACTION_IN_STATE.AwaitingInclusion,
    ledger: {
      status: async (): Promise<LedgerTransactionStatus> => ({
        outcome: 'failed',
        failure: 'FailEntirely',
        error: 'rejected',
      }),
    },
    expectTransitions: [
      {
        method: 'recordRejection',
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

describe('TransactionStateResolverImpl.resolveTransaction', () => {
  test.each(cases)(
    '$name',
    async ({ stored, ledger, controller, expectTransitions, expectWrites }) => {
      const transitions: Transition[] = []
      let writes = 0
      const recording = (method: string) => async (args: object) => {
        transitions.push({ method, args })
        return stored ?? transactionFixture()
      }
      const resolver = new TransactionStateResolverImpl(
        mock<MidnightTransactionRepository>('MidnightTransactionRepository', {
          get: async (name) => {
            expect(name).toBe(TRANSACTION_NAME)
            return stored
          },
        }),
        mock<TransactionStateController>('TransactionStateController', {
          recordProof: recording('recordProof'),
          recordProofFailure: recording('recordProofFailure'),
          recordSubmission: recording('recordSubmission'),
          recordRejection: recording('recordRejection'),
          recordSuccess: recording('recordSuccess'),
          expireTransaction: recording('expireTransaction'),
          ...controller?.(transitions),
        }),
        mock<TransactionLedger>('TransactionLedger', ledger),
        mock<UnitOfWork>('UnitOfWork', {
          runInTransaction: (work) => {
            writes += 1
            return work()
          },
        }),
      )
      await resolver.resolveTransaction({ name: TRANSACTION_NAME })
      expect(transitions).toEqual(expectTransitions)
      expect(writes).toBe(expectWrites ?? expectTransitions.length)
    },
  )
})
