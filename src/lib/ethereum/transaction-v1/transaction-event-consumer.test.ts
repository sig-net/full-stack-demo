import { describe, expect, test } from 'vitest'

import { EthereumTransactionEventConsumer } from '@/lib/ethereum/transaction-v1/transaction-event-consumer'
import {
  TRANSACTION_NAME,
  VAULT_REQUEST_NAME,
} from '@/lib/ethereum/transaction-v1/transaction-fixtures'
import { ETHEREUM_TRANSACTION_EVENT_BY_STATE } from '@/lib/ethereum/transaction-v1/transaction-state-controller'
import type { EthereumTransactionStateResolver } from '@/lib/ethereum/transaction-v1/transaction-state-resolver'
import { newEvent } from '@/lib/event/event'
import { mock } from '@/lib/testing/mock'

describe('EthereumTransactionEventConsumer', () => {
  function consumer(resolved: string[]) {
    return new EthereumTransactionEventConsumer(
      mock<EthereumTransactionStateResolver>('EthereumTransactionStateResolver', {
        resolveTransaction: async ({ name }) => {
          resolved.push(name)
        },
      }),
    )
  }

  test('wants every transaction lifecycle event and nothing else', () => {
    const subject = consumer([])
    for (const definition of Object.values(ETHEREUM_TRANSACTION_EVENT_BY_STATE)) {
      expect(
        subject.wantsEvent(
          definition.create(TRANSACTION_NAME, {
            name: TRANSACTION_NAME,
            parent: VAULT_REQUEST_NAME,
          }),
        ),
      ).toBe(true)
    }
    expect(subject.wantsEvent(newEvent('midnight.transaction-v1.succeeded', 'k', {}))).toBe(false)
  })

  test('hands the named transaction to the resolver', async () => {
    const resolved: string[] = []
    await consumer(resolved).handleEvent(
      ETHEREUM_TRANSACTION_EVENT_BY_STATE.AwaitingSubmission.create(TRANSACTION_NAME, {
        name: TRANSACTION_NAME,
        parent: VAULT_REQUEST_NAME,
      }),
    )
    expect(resolved).toEqual([TRANSACTION_NAME])
  })

  test('refuses malformed event data before touching the resolver', async () => {
    const resolved: string[] = []
    await expect(
      consumer(resolved).handleEvent(
        newEvent(ETHEREUM_TRANSACTION_EVENT_BY_STATE.AwaitingInclusion.type, 'k', {
          name: 'nope',
        }),
      ),
    ).rejects.toThrow('is malformed')
    expect(resolved).toEqual([])
  })
})
