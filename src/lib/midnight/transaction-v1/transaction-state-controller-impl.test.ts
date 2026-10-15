import { describe, expect, test } from 'vitest'

import type { Event } from '@/lib/event/event'
import type { EventPublisher } from '@/lib/event/event-publisher'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import {
  DEPOSIT_NAME,
  TRANSACTION_IN_STATE,
  TRANSACTION_NAME,
} from '@/lib/midnight/transaction-v1/transaction-fixtures'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import {
  type CommitTransactionArgs,
  MIDNIGHT_TRANSACTION_EVENT_BY_STATE,
  type MidnightTransactionStateController,
  MidnightTransactionStateConflict,
} from '@/lib/midnight/transaction-v1/transaction-state-controller'
import { MidnightTransactionStateControllerImpl } from '@/lib/midnight/transaction-v1/transaction-state-controller-impl'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

interface Calls {
  created: MidnightTransaction[]
  updated: MidnightTransaction[]
  published: Event[]
  logger: RecordingLogger
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
  return new MidnightTransactionStateControllerImpl(
    transactionRepository,
    eventPublisher,
    calls.logger,
  )
}

function emptyCalls(): Calls {
  return { created: [], updated: [], published: [], logger: new RecordingLogger() }
}

describe('MidnightTransactionStateControllerImpl.commitTransaction', () => {
  const args: CommitTransactionArgs = {
    name: TRANSACTION_NAME,
    parent: DEPOSIT_NAME,
    circuit: 'completeDeposit',
    signer: 'caller',
    unprovenTx: 'unproven',
  }

  const cases: ReadonlyArray<{
    name: string
    create?: MidnightTransactionRepository['create']
    check: (result: Promise<MidnightTransaction>, calls: Calls, before: number) => Promise<void>
  }> = [
    {
      name: 'success - stored in AwaitingProof with an hour to live and the fields later steps fill unset',
      check: async (result, calls, before) => {
        const stored = await result
        expect(stored).toEqual({
          ...args,
          state: 'AwaitingProof',
          unboundTx: null,
          finalizedTx: null,
          txId: null,
          blockHeight: null,
          expireTime: new Date(stored.createTime.getTime() + 3_600_000),
          failure: null,
          error: null,
          createTime: stored.createTime,
          updateTime: stored.createTime,
        })
        expect(stored.createTime.getTime()).toBeGreaterThanOrEqual(before)
        expect(calls.created).toEqual([stored])
        expect(calls.published).toHaveLength(1)
        expect(calls.published[0]).toMatchObject({
          type: MIDNIGHT_TRANSACTION_EVENT_BY_STATE.AwaitingProof.type,
          key: TRANSACTION_NAME,
          data: { name: TRANSACTION_NAME, parent: DEPOSIT_NAME },
        })
        expect(calls.logger.lines).toEqual([
          {
            level: 'info',
            message: 'resource created',
            fields: { resource: TRANSACTION_NAME, parent: DEPOSIT_NAME, toState: 'AwaitingProof' },
          },
        ])
      },
    },
    {
      name: 'failure - the repository refuses the row, so nothing is published or logged',
      create: async () => {
        throw new Error(`${TRANSACTION_NAME} already exists`)
      },
      check: async (result, calls) => {
        await expect(result).rejects.toThrow('already exists')
        expect(calls.published).toHaveLength(0)
        expect(calls.logger.lines).toEqual([])
      },
    },
  ]

  test.each(cases)('$name', async ({ create, check }) => {
    const calls = emptyCalls()
    const { transactionRepository, eventPublisher } = fields(undefined, calls)
    const controller = new MidnightTransactionStateControllerImpl(
      create === undefined
        ? transactionRepository
        : mock<MidnightTransactionRepository>('MidnightTransactionRepository', { create }),
      eventPublisher,
      calls.logger,
    )
    const before = Date.now()
    await check(controller.commitTransaction(args), calls, before)
  })
})

describe('MidnightTransactionStateControllerImpl transitions', () => {
  type Transition = (controller: MidnightTransactionStateController) => Promise<MidnightTransaction>

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
      transition: (c) => c.recordRejection({ name: TRANSACTION_NAME, error: 'invalid' }),
      to: 'Failed',
      patch: { failure: 'Rejected', error: 'invalid' },
    },
    {
      name: 'recordLedgerFailure from AwaitingInclusion',
      from: TRANSACTION_IN_STATE.AwaitingInclusion,
      transition: (c) =>
        c.recordLedgerFailure({
          name: TRANSACTION_NAME,
          failure: 'FailEntirely',
          error: 'rejected',
          blockHeight: 42,
        }),
      to: 'Failed',
      patch: { failure: 'FailEntirely', error: 'rejected', blockHeight: 42 },
    },
    {
      name: 'recordSuccess',
      from: TRANSACTION_IN_STATE.AwaitingInclusion,
      transition: (c) => c.recordSuccess({ name: TRANSACTION_NAME, blockHeight: 42 }),
      to: 'Succeeded',
      patch: { blockHeight: 42 },
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
    '$name applies, locks the row, publishes the entered state and logs the transition',
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
        type: MIDNIGHT_TRANSACTION_EVENT_BY_STATE[to].type,
        key: TRANSACTION_NAME,
        data: { name: TRANSACTION_NAME, parent: DEPOSIT_NAME },
      })
      expect(calls.logger.lines).toEqual([
        {
          level: 'info',
          message: 'transition applied',
          fields: {
            resource: TRANSACTION_NAME,
            parent: DEPOSIT_NAME,
            action: expect.any(String),
            fromState: from.state,
            toState: to,
          },
        },
      ])
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
      transition: (c) => c.recordSuccess({ name: TRANSACTION_NAME, blockHeight: 42 }),
    },
    {
      name: 'expireTransaction on a terminal transaction',
      from: TRANSACTION_IN_STATE.Failed,
      transition: (c) => c.expireTransaction({ name: TRANSACTION_NAME }),
    },
  ]

  test.each(refused)(
    '$name is a state conflict that writes, publishes and logs nothing',
    async ({ from, transition }) => {
      const calls = emptyCalls()
      await expect(transition(controllerOver(from, calls))).rejects.toBeInstanceOf(
        MidnightTransactionStateConflict,
      )
      expect(calls.updated).toHaveLength(0)
      expect(calls.published).toHaveLength(0)
      expect(calls.logger.lines).toEqual([])
    },
  )

  test('a transition on a missing transaction throws', async () => {
    const calls = emptyCalls()
    await expect(
      controllerOver(undefined, calls).recordSuccess({ name: TRANSACTION_NAME, blockHeight: 42 }),
    ).rejects.toThrow(`${TRANSACTION_NAME} does not exist`)
  })
})
