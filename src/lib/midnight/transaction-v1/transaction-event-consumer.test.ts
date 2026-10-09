import { describe, expect, test } from 'vitest'

import { newEvent } from '@/lib/event/event'
import { TRANSACTION_NAME } from '@/lib/midnight/transaction-v1/transaction-fixtures'
import { TransactionEventConsumer } from '@/lib/midnight/transaction-v1/transaction-event-consumer'
import { TRANSACTION_EVENT_BY_STATE } from '@/lib/midnight/transaction-v1/transaction-state-controller'
import type { TransactionStateResolver } from '@/lib/midnight/transaction-v1/transaction-state-resolver'
import { mock } from '@/lib/testing/mock'

describe('TransactionEventConsumer', () => {
  function consumer(resolved: string[]) {
    return new TransactionEventConsumer(
      mock<TransactionStateResolver>('TransactionStateResolver', {
        resolveTransaction: async ({ name }) => {
          resolved.push(name)
        },
      }),
    )
  }

  test('wants every transaction lifecycle event and nothing else', () => {
    const subject = consumer([])
    for (const definition of Object.values(TRANSACTION_EVENT_BY_STATE)) {
      expect(
        subject.wantsEvent(definition.create(TRANSACTION_NAME, { name: TRANSACTION_NAME })),
      ).toBe(true)
    }
    expect(subject.wantsEvent(newEvent('deposit.something', 'k', {}))).toBe(false)
  })

  test('hands the named transaction to the resolver', async () => {
    const resolved: string[] = []
    await consumer(resolved).handleEvent(
      TRANSACTION_EVENT_BY_STATE.AwaitingProof.create(TRANSACTION_NAME, { name: TRANSACTION_NAME }),
    )
    expect(resolved).toEqual([TRANSACTION_NAME])
  })

  test('refuses malformed event data before touching the resolver', async () => {
    const resolved: string[] = []
    await expect(
      consumer(resolved).handleEvent(
        newEvent(TRANSACTION_EVENT_BY_STATE.AwaitingInclusion.type, 'k', { name: 'nope' }),
      ),
    ).rejects.toThrow('is malformed')
    expect(resolved).toEqual([])
  })
})
