import { describe, expect, test } from 'vitest'

import type { Event } from '@/lib/event/event'
import type { EventPublisher } from '@/lib/event/event-publisher'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import {
  DEPOSIT_NAME,
  TRANSACTION_IN_STATE,
  TRANSACTION_NAME,
  transactionFixture,
} from '@/lib/midnight/transaction-v1/transaction-fixtures'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import {
  TRANSACTION_EVENT_BY_STATE,
  type TransactionStateController,
  TransactionStateConflict,
} from '@/lib/midnight/transaction-v1/transaction-state-controller'
import { TransactionStateControllerImpl } from '@/lib/midnight/transaction-v1/transaction-state-controller-impl'
import { mock } from '@/lib/testing/mock'

interface Calls {
  created: MidnightTransaction[]
  updated: MidnightTransaction[]
  published: Event[]
}

/** A repository holding one row, and a publisher that records. Reads report the lock they took. */
function fields(stored: MidnightTransaction | undefined, calls: Calls, locks: string[] = []) {
  return {
    transactionRepository: mock<MidnightTransactionRepository>('MidnightTransactionRepository', {
      create: async (transaction) => {
        calls.created.push(transaction)
        return transaction
      },
      search: async (args) => {
        locks.push(args.lock ?? 'none')
        expect(args.criteria).toEqual([
          { type: 'exact-text', field: 'name', text: TRANSACTION_NAME },
        ])
        return stored === undefined ? [] : [stored]
      },
      update: async (transaction) => {
        calls.updated.push(transaction)
        return transaction
      },
    }),
    eventPublisher: mock<EventPublisher>('EventPublisher', {
      publishEvent: async (event) => {
        calls.published.push(event)
      },
    }),
  }
}

function controllerOver(
  stored: MidnightTransaction | undefined,
  calls: Calls,
  locks: string[] = [],
) {
  const { transactionRepository, eventPublisher } = fields(stored, calls, locks)
  return new TransactionStateControllerImpl(transactionRepository, eventPublisher)
}

function emptyCalls(): Calls {
  return { created: [], updated: [], published: [] }
}

describe('TransactionStateControllerImpl.commitTransaction', () => {
  const cases: ReadonlyArray<{
    name: string
    args: MidnightTransaction
    check: (result: Promise<MidnightTransaction>, calls: Calls) => Promise<void>
  }> = [
    {
      name: 'success - AwaitingProof with the unproven bytes and the TTL',
      args: transactionFixture({ createTime: new Date(0), updateTime: new Date(0) }),
      check: async (result, calls) => {
        const stored = await result
        expect(stored.createTime.getTime()).toBeGreaterThan(0)
        expect(stored.updateTime).toEqual(stored.createTime)
        expect(calls.created).toEqual([stored])
        expect(calls.published).toHaveLength(1)
        expect(calls.published[0]).toMatchObject({
          type: TRANSACTION_EVENT_BY_STATE.AwaitingProof.type,
          key: TRANSACTION_NAME,
          data: { name: TRANSACTION_NAME, parent: DEPOSIT_NAME },
        })
      },
    },
    {
      name: 'success - AwaitingWallet with the proven bytes and the TTL',
      args: TRANSACTION_IN_STATE.AwaitingWallet,
      check: async (result, calls) => {
        await result
        expect(calls.published[0]?.type).toBe(TRANSACTION_EVENT_BY_STATE.AwaitingWallet.type)
      },
    },
    {
      name: 'failure - a state a transaction cannot be committed in',
      args: TRANSACTION_IN_STATE.AwaitingInclusion,
      check: async (result, calls) => {
        await expect(result).rejects.toThrow(
          `${TRANSACTION_NAME} cannot be committed in state AwaitingInclusion`,
        )
        expect(calls.created).toHaveLength(0)
      },
    },
    {
      name: 'failure - AwaitingProof with a field a later step produces',
      args: transactionFixture({ unboundTx: 'unbound' }),
      check: async (result) => {
        await expect(result).rejects.toThrow('must have unboundTx unset')
      },
    },
    {
      name: 'failure - the repository refuses the row, so nothing is published',
      args: transactionFixture(),
      check: async (result, calls) => {
        await expect(result).rejects.toThrow('already exists')
        expect(calls.published).toHaveLength(0)
      },
    },
  ]

  test.each(cases)('$name', async ({ name, args, check }) => {
    const calls = emptyCalls()
    const refusing = name.includes('repository refuses')
    const { eventPublisher } = fields(undefined, calls)
    const transactionRepository = refusing
      ? mock<MidnightTransactionRepository>('MidnightTransactionRepository', {
          create: async () => {
            throw new Error(`${TRANSACTION_NAME} already exists`)
          },
        })
      : fields(undefined, calls).transactionRepository
    const controller = new TransactionStateControllerImpl(transactionRepository, eventPublisher)
    await check(controller.commitTransaction({ transaction: args }), calls)
  })
})

describe('TransactionStateControllerImpl transitions', () => {
  type Transition = (controller: TransactionStateController) => Promise<MidnightTransaction>

  const cases: ReadonlyArray<{
    name: string
    from: MidnightTransaction
    transition: Transition
    to: MidnightTransaction['state']
    patch: Partial<MidnightTransaction>
  }> = [
    {
      name: 'recordProof',
      from: TRANSACTION_IN_STATE.AwaitingProof,
      transition: (c) => c.recordProof({ name: TRANSACTION_NAME, unboundTx: 'unbound' }),
      to: 'AwaitingWallet',
      patch: { unboundTx: 'unbound', unprovenTx: null },
    },
    {
      name: 'recordProofFailure',
      from: TRANSACTION_IN_STATE.AwaitingProof,
      transition: (c) =>
        c.recordProofFailure({ name: TRANSACTION_NAME, error: 'proof server down' }),
      to: 'Failed',
      patch: { failure: 'ProofFailed', error: 'proof server down', unprovenTx: null },
    },
    {
      name: 'submitTransaction',
      from: TRANSACTION_IN_STATE.AwaitingWallet,
      transition: (c) => c.submitTransaction({ name: TRANSACTION_NAME, finalizedTx: 'finalized' }),
      to: 'AwaitingSubmission',
      patch: { finalizedTx: 'finalized' },
    },
    {
      name: 'recordSubmission',
      from: TRANSACTION_IN_STATE.AwaitingSubmission,
      transition: (c) => c.recordSubmission({ name: TRANSACTION_NAME, txId: 'tx-1' }),
      to: 'AwaitingInclusion',
      patch: { txId: 'tx-1' },
    },
    {
      name: 'recordRejection from AwaitingSubmission',
      from: TRANSACTION_IN_STATE.AwaitingSubmission,
      transition: (c) =>
        c.recordRejection({ name: TRANSACTION_NAME, failure: 'Rejected', error: 'invalid' }),
      to: 'Failed',
      patch: { failure: 'Rejected', error: 'invalid' },
    },
    {
      name: 'recordRejection from AwaitingInclusion',
      from: TRANSACTION_IN_STATE.AwaitingInclusion,
      transition: (c) =>
        c.recordRejection({ name: TRANSACTION_NAME, failure: 'FailEntirely', error: 'rejected' }),
      to: 'Failed',
      patch: { failure: 'FailEntirely', error: 'rejected' },
    },
    {
      name: 'recordSuccess',
      from: TRANSACTION_IN_STATE.AwaitingInclusion,
      transition: (c) => c.recordSuccess({ name: TRANSACTION_NAME }),
      to: 'Succeeded',
      patch: {},
    },
    {
      name: 'expireTransaction from AwaitingProof',
      from: TRANSACTION_IN_STATE.AwaitingProof,
      transition: (c) => c.expireTransaction({ name: TRANSACTION_NAME }),
      to: 'Failed',
      patch: { failure: 'Expired', unprovenTx: null },
    },
    {
      name: 'expireTransaction from AwaitingInclusion',
      from: TRANSACTION_IN_STATE.AwaitingInclusion,
      transition: (c) => c.expireTransaction({ name: TRANSACTION_NAME }),
      to: 'Failed',
      patch: { failure: 'Expired' },
    },
  ]

  test.each(cases)(
    '$name applies, locks the row and publishes the entered state',
    async ({ from, transition, to, patch }) => {
      const calls = emptyCalls()
      const locks: string[] = []
      const stored = await transition(controllerOver(from, calls, locks))
      expect(locks).toEqual(['update'])
      expect(stored).toEqual({ ...from, ...patch, state: to, updateTime: stored.updateTime })
      expect(stored.updateTime.getTime()).toBeGreaterThan(from.updateTime.getTime())
      expect(calls.updated).toEqual([stored])
      expect(calls.published).toHaveLength(1)
      expect(calls.published[0]).toMatchObject({
        type: TRANSACTION_EVENT_BY_STATE[to].type,
        key: TRANSACTION_NAME,
        data: { name: TRANSACTION_NAME, parent: DEPOSIT_NAME },
      })
    },
  )

  const refused: ReadonlyArray<{
    name: string
    from: MidnightTransaction
    transition: Transition
  }> = [
    {
      name: 'recordProof once already proven',
      from: TRANSACTION_IN_STATE.AwaitingWallet,
      transition: (c) => c.recordProof({ name: TRANSACTION_NAME, unboundTx: 'again' }),
    },
    {
      name: 'submitTransaction before proving',
      from: TRANSACTION_IN_STATE.AwaitingProof,
      transition: (c) => c.submitTransaction({ name: TRANSACTION_NAME, finalizedTx: 'x' }),
    },
    {
      name: 'recordSuccess on a terminal transaction',
      from: TRANSACTION_IN_STATE.Succeeded,
      transition: (c) => c.recordSuccess({ name: TRANSACTION_NAME }),
    },
    {
      name: 'expireTransaction on a terminal transaction',
      from: TRANSACTION_IN_STATE.Failed,
      transition: (c) => c.expireTransaction({ name: TRANSACTION_NAME }),
    },
  ]

  test.each(refused)(
    '$name is a state conflict that writes and publishes nothing',
    async ({ from, transition }) => {
      const calls = emptyCalls()
      await expect(transition(controllerOver(from, calls))).rejects.toBeInstanceOf(
        TransactionStateConflict,
      )
      expect(calls.updated).toHaveLength(0)
      expect(calls.published).toHaveLength(0)
    },
  )

  test('a transition on a missing transaction throws', async () => {
    const calls = emptyCalls()
    await expect(
      controllerOver(undefined, calls).recordSuccess({ name: TRANSACTION_NAME }),
    ).rejects.toThrow(`${TRANSACTION_NAME} does not exist`)
  })
})
