import { describe, expect, test } from 'vitest'

import { ETHEREUM_TRANSACTION_EVENT_BY_STATE } from '@/lib/ethereum/transaction-v1/transaction-state-controller'
import { newEvent } from '@/lib/event/event'
import { VaultRequestEventConsumer } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-event-consumer'
import {
  CALLER_NAME,
  DEPOSIT_NAME,
  VAULT_REQUEST_NAME,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import { VAULT_REQUEST_EVENT_BY_STATE } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import type { VaultRequestStateResolver } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-resolver'
import { MIDNIGHT_TRANSACTION_EVENT_BY_STATE } from '@/lib/midnight/transaction-v1/transaction-state-controller'
import { mock } from '@/lib/testing/mock'

const MIDNIGHT_CHILD = `${CALLER_NAME}/midnight-transactions/0d8c7d10-6a3e-4d7e-9f1c-2b7a1c3d4e5f`
const ETHEREUM_CHILD = `${CALLER_NAME}/ethereum-transactions/0d8c7d10-6a3e-4d7e-9f1c-2b7a1c3d4e5f`

describe('VaultRequestEventConsumer', () => {
  function consumer(resolved: string[]) {
    return new VaultRequestEventConsumer(
      mock<VaultRequestStateResolver>('VaultRequestStateResolver', {
        resolveVaultRequest: async ({ name }) => {
          resolved.push(name)
        },
      }),
    )
  }

  test('wants every vault request lifecycle event', () => {
    const subject = consumer([])
    for (const definition of Object.values(VAULT_REQUEST_EVENT_BY_STATE)) {
      expect(
        subject.wantsEvent(
          definition.create(VAULT_REQUEST_NAME, { name: VAULT_REQUEST_NAME, parent: DEPOSIT_NAME }),
        ),
      ).toBe(true)
    }
  })

  const childEvents = [
    ['a Midnight child succeeding', MIDNIGHT_TRANSACTION_EVENT_BY_STATE.Succeeded, MIDNIGHT_CHILD],
    ['a Midnight child failing', MIDNIGHT_TRANSACTION_EVENT_BY_STATE.Failed, MIDNIGHT_CHILD],
    ['an Ethereum child succeeding', ETHEREUM_TRANSACTION_EVENT_BY_STATE.Succeeded, ETHEREUM_CHILD],
    ['an Ethereum child failing', ETHEREUM_TRANSACTION_EVENT_BY_STATE.Failed, ETHEREUM_CHILD],
  ] as const

  test.each(childEvents)('wants %s under a vault request', (_name, definition, child) => {
    expect(
      consumer([]).wantsEvent(
        definition.create(child, { name: child, parent: VAULT_REQUEST_NAME }),
      ),
    ).toBe(true)
  })

  const unwanted = [
    [
      'a child terminal event under another resource',
      MIDNIGHT_TRANSACTION_EVENT_BY_STATE.Succeeded.create(MIDNIGHT_CHILD, {
        name: MIDNIGHT_CHILD,
        parent: DEPOSIT_NAME,
      }),
    ],
    [
      'a child event that is not terminal',
      MIDNIGHT_TRANSACTION_EVENT_BY_STATE.AwaitingProof.create(MIDNIGHT_CHILD, {
        name: MIDNIGHT_CHILD,
        parent: VAULT_REQUEST_NAME,
      }),
    ],
    [
      'a malformed child terminal event',
      newEvent(ETHEREUM_TRANSACTION_EVENT_BY_STATE.Failed.type, 'k', { parent: 7 }),
    ],
    ['an unrelated event', newEvent('deposit.something', 'k', {})],
  ] as const

  test.each(unwanted)('does not want %s', (_name, event) => {
    expect(consumer([]).wantsEvent(event)).toBe(false)
  })

  test('hands the named request to the resolver on its own event', async () => {
    const resolved: string[] = []
    await consumer(resolved).handleEvent(
      VAULT_REQUEST_EVENT_BY_STATE.AwaitingSend.create(VAULT_REQUEST_NAME, {
        name: VAULT_REQUEST_NAME,
        parent: DEPOSIT_NAME,
      }),
    )
    expect(resolved).toEqual([VAULT_REQUEST_NAME])
  })

  test("hands the parent to the resolver on a child's terminal event", async () => {
    const resolved: string[] = []
    await consumer(resolved).handleEvent(
      ETHEREUM_TRANSACTION_EVENT_BY_STATE.Succeeded.create(ETHEREUM_CHILD, {
        name: ETHEREUM_CHILD,
        parent: VAULT_REQUEST_NAME,
      }),
    )
    expect(resolved).toEqual([VAULT_REQUEST_NAME])
  })

  test('refuses malformed event data before touching the resolver', async () => {
    const resolved: string[] = []
    await expect(
      consumer(resolved).handleEvent(
        newEvent(VAULT_REQUEST_EVENT_BY_STATE.AwaitingSend.type, 'k', { name: 'nope' }),
      ),
    ).rejects.toThrow('is malformed')
    await expect(
      consumer(resolved).handleEvent(
        MIDNIGHT_TRANSACTION_EVENT_BY_STATE.Failed.create(MIDNIGHT_CHILD, {
          name: MIDNIGHT_CHILD,
          parent: DEPOSIT_NAME,
        }),
      ),
    ).rejects.toThrow('does not name a vault request')
    expect(resolved).toEqual([])
  })
})
