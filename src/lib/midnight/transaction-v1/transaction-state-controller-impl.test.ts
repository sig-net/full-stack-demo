import { describe, expect, test } from 'vitest'

import type { Event } from '@/lib/event/event'
import type { EventPublisher } from '@/lib/event/event-publisher'
import {
  MIDNIGHT_TRANSACTION_CREATED_EVENT,
  type MidnightTransaction,
} from '@/lib/midnight/transaction-v1/transaction'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import { TransactionStateControllerImpl } from '@/lib/midnight/transaction-v1/transaction-state-controller-impl'
import { mock } from '@/lib/testing/mock'

const CALLER = `callers/${'ab'.repeat(32)}`
const NAME = `${CALLER}/midnight-transactions/0d8c7d10-6a3e-4d7e-9f1c-2b7a1c3d4e5f`
const PARENT = `${CALLER}/erc20-vault-deposits/1f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b`
const EPOCH = new Date(0)

function transaction(overrides: Partial<MidnightTransaction> = {}): MidnightTransaction {
  return {
    name: NAME,
    parent: PARENT,
    state: 'Proving',
    circuit: 'completeDeposit',
    unprovenTx: 'aa',
    unboundTx: null,
    finalizedTx: null,
    expireTime: new Date('2026-10-09T10:00:00Z'),
    txId: null,
    error: null,
    createTime: EPOCH,
    updateTime: EPOCH,
    ...overrides,
  }
}

describe('TransactionStateControllerImpl.commitTransaction', () => {
  interface Fields {
    transactionRepository: MidnightTransactionRepository
    eventPublisher: EventPublisher
  }

  interface Case {
    name: string
    fields: (calls: { created: MidnightTransaction[]; published: Event[] }) => Fields
    args: MidnightTransaction
    check: (
      result: Promise<MidnightTransaction>,
      calls: { created: MidnightTransaction[]; published: Event[] },
    ) => Promise<void>
  }

  const stores = (calls: { created: MidnightTransaction[]; published: Event[] }): Fields => ({
    transactionRepository: mock<MidnightTransactionRepository>('MidnightTransactionRepository', {
      create: async (stored) => {
        calls.created.push(stored)
        return stored
      },
    }),
    eventPublisher: mock<EventPublisher>('EventPublisher', {
      publishEvent: async (event) => {
        calls.published.push(event)
      },
    }),
  })

  const rejects = (): Fields => ({
    transactionRepository: mock<MidnightTransactionRepository>('MidnightTransactionRepository'),
    eventPublisher: mock<EventPublisher>('EventPublisher'),
  })

  const cases: Case[] = [
    {
      name: 'success - Proving with the unproven bytes and the TTL',
      fields: stores,
      args: transaction(),
      check: async (result, calls) => {
        const stored = await result
        expect(stored.createTime.getTime()).toBeGreaterThan(EPOCH.getTime())
        expect(stored.updateTime).toEqual(stored.createTime)
        expect(stored).toEqual({
          ...transaction(),
          createTime: stored.createTime,
          updateTime: stored.updateTime,
        })
        expect(calls.created).toEqual([stored])
        expect(calls.published).toHaveLength(1)
        expect(calls.published[0]).toMatchObject({
          type: MIDNIGHT_TRANSACTION_CREATED_EVENT,
          key: NAME,
          data: { name: NAME },
        })
      },
    },
    {
      name: 'success - Signing & Balancing with the proven bytes and the TTL',
      fields: stores,
      args: transaction({ state: 'Signing & Balancing', unprovenTx: null, unboundTx: 'bb' }),
      check: async (result, calls) => {
        const stored = await result
        expect(stored.state).toBe('Signing & Balancing')
        expect(calls.created).toHaveLength(1)
        expect(calls.published).toHaveLength(1)
      },
    },
    {
      name: 'failure - a state a transaction cannot be committed in',
      fields: rejects,
      args: transaction({ state: 'Pending' }),
      check: async (result) => {
        await expect(result).rejects.toThrow(`${NAME} cannot be committed in state Pending`)
      },
    },
    {
      name: 'failure - Proving with a field a later step produces',
      fields: rejects,
      args: transaction({ unboundTx: 'bb' }),
      check: async (result) => {
        await expect(result).rejects.toThrow(`${NAME} in state Proving must have unboundTx unset`)
      },
    },
    {
      name: 'failure - Proving without the TTL',
      fields: rejects,
      args: transaction({ expireTime: null }),
      check: async (result) => {
        await expect(result).rejects.toThrow(`${NAME} in state Proving must have expireTime set`)
      },
    },
    {
      name: 'failure - Signing & Balancing still holding the unproven bytes',
      fields: rejects,
      args: transaction({ state: 'Signing & Balancing', unboundTx: 'bb' }),
      check: async (result) => {
        await expect(result).rejects.toThrow(
          `${NAME} in state Signing & Balancing must have unprovenTx unset`,
        )
      },
    },
    {
      name: 'failure - the repository refuses the row, so nothing is published',
      fields: () => ({
        transactionRepository: mock<MidnightTransactionRepository>(
          'MidnightTransactionRepository',
          {
            create: async () => {
              throw new Error(`${NAME} already exists`)
            },
          },
        ),
        eventPublisher: mock<EventPublisher>('EventPublisher'),
      }),
      args: transaction(),
      check: async (result, calls) => {
        await expect(result).rejects.toThrow(`${NAME} already exists`)
        expect(calls.published).toHaveLength(0)
      },
    },
  ]

  test.each(cases)('$name', async ({ fields, args, check }) => {
    const calls = { created: [] as MidnightTransaction[], published: [] as Event[] }
    const { transactionRepository, eventPublisher } = fields(calls)
    const controller = new TransactionStateControllerImpl(transactionRepository, eventPublisher)
    await check(controller.commitTransaction({ transaction: args }), calls)
  })
})
