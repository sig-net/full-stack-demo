import { describe, expect, test } from 'vitest'

import { newEvent } from '@/lib/event/event'
import { DEPOSIT_NAME, TRANSACTION_NAME } from '@/lib/midnight/transaction-v1/transaction-fixtures'
import { MidnightTransactionEventConsumer } from '@/lib/midnight/transaction-v1/transaction-event-consumer'
import { MIDNIGHT_TRANSACTION_EVENT_BY_STATE } from '@/lib/midnight/transaction-v1/transaction-state-controller'
import type { MidnightTransactionStateResolver } from '@/lib/midnight/transaction-v1/transaction-state-resolver'
import { mock } from '@/lib/testing/mock'

describe('MidnightTransactionEventConsumer', () => {
  function consumer(resolved: string[]) {
    return new MidnightTransactionEventConsumer(
      mock<MidnightTransactionStateResolver>('MidnightTransactionStateResolver', {
        resolveTransaction: async ({ name }) => {
          resolved.push(name)
        },
      }),
    )
  }

  test('wants every transaction lifecycle event and nothing else', () => {
    const subject = consumer([])
    for (const definition of Object.values(MIDNIGHT_TRANSACTION_EVENT_BY_STATE)) {
      expect(
        subject.wantsEvent(
          definition.create(TRANSACTION_NAME, { name: TRANSACTION_NAME, parent: DEPOSIT_NAME }),
        ),
      ).toBe(true)
    }
    expect(subject.wantsEvent(newEvent('deposit.something', 'k', {}))).toBe(false)
  })

  test('hands the named transaction to the resolver', async () => {
    const resolved: string[] = []
    await consumer(resolved).handleEvent(
      MIDNIGHT_TRANSACTION_EVENT_BY_STATE.AwaitingProof.create(TRANSACTION_NAME, {
        name: TRANSACTION_NAME,
        parent: DEPOSIT_NAME,
      }),
    )
    expect(resolved).toEqual([TRANSACTION_NAME])
  })

  test('refuses malformed event data before touching the resolver', async () => {
    const resolved: string[] = []
    await expect(
      consumer(resolved).handleEvent(
        newEvent(MIDNIGHT_TRANSACTION_EVENT_BY_STATE.AwaitingInclusion.type, 'k', { name: 'nope' }),
      ),
    ).rejects.toThrow('is malformed')
    expect(resolved).toEqual([])
  })
})
