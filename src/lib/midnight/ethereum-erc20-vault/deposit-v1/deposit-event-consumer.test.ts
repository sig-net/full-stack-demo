import { describe, expect, test } from 'vitest'

import { newEvent } from '@/lib/event/event'
import { DepositEventConsumer } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-event-consumer'
import {
  CALLER_NAME,
  DEPOSIT_NAME,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-fixtures'
import { DEPOSIT_EVENT_BY_STATE } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
import type { DepositStateResolver } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-resolver'
import { VAULT_REQUEST_EVENT_BY_STATE } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import { MIDNIGHT_TRANSACTION_EVENT_BY_STATE } from '@/lib/midnight/transaction-v1/transaction-state-controller'
import { mock } from '@/lib/testing/mock'

const MIDNIGHT_CHILD = `${CALLER_NAME}/midnight-transactions/0d8c7d10-6a3e-4d7e-9f1c-2b7a1c3d4e5f`
const VAULT_REQUEST_CHILD = `${CALLER_NAME}/ethereum-erc20-vault-requests/7c1d9e2f-3a4b-4c5d-8e6f-0a1b2c3d4e5f`

describe('DepositEventConsumer', () => {
  function consumer(resolved: string[]) {
    return new DepositEventConsumer(
      mock<DepositStateResolver>('DepositStateResolver', {
        resolveDeposit: async ({ name }) => {
          resolved.push(name)
        },
      }),
    )
  }

  test('wants every deposit lifecycle event', () => {
    const subject = consumer([])
    for (const definition of Object.values(DEPOSIT_EVENT_BY_STATE)) {
      expect(subject.wantsEvent(definition.create(DEPOSIT_NAME, { name: DEPOSIT_NAME }))).toBe(true)
    }
  })

  const childEvents = [
    ['a Midnight child succeeding', MIDNIGHT_TRANSACTION_EVENT_BY_STATE.Succeeded, MIDNIGHT_CHILD],
    ['a Midnight child failing', MIDNIGHT_TRANSACTION_EVENT_BY_STATE.Failed, MIDNIGHT_CHILD],
    ['the vault request attested', VAULT_REQUEST_EVENT_BY_STATE.Attested, VAULT_REQUEST_CHILD],
  ] as const

  test.each(childEvents)('wants %s under a deposit', (_name, definition, child) => {
    expect(
      consumer([]).wantsEvent(definition.create(child, { name: child, parent: DEPOSIT_NAME })),
    ).toBe(true)
  })

  const unwanted = [
    [
      'a child terminal event under another resource',
      MIDNIGHT_TRANSACTION_EVENT_BY_STATE.Succeeded.create(MIDNIGHT_CHILD, {
        name: MIDNIGHT_CHILD,
        parent: VAULT_REQUEST_CHILD,
      }),
    ],
    [
      'a child event that is not terminal',
      MIDNIGHT_TRANSACTION_EVENT_BY_STATE.AwaitingWallet.create(MIDNIGHT_CHILD, {
        name: MIDNIGHT_CHILD,
        parent: DEPOSIT_NAME,
      }),
    ],
    [
      'a vault request event that is not terminal',
      VAULT_REQUEST_EVENT_BY_STATE.AwaitingFlush.create(VAULT_REQUEST_CHILD, {
        name: VAULT_REQUEST_CHILD,
        parent: DEPOSIT_NAME,
      }),
    ],
    [
      'a malformed child terminal event',
      newEvent(VAULT_REQUEST_EVENT_BY_STATE.Attested.type, 'k', { parent: 7 }),
    ],
    ['an unrelated event', newEvent('ethereum.transaction-v1.succeeded', 'k', {})],
  ] as const

  test.each(unwanted)('does not want %s', (_name, event) => {
    expect(consumer([]).wantsEvent(event)).toBe(false)
  })

  test('hands the named deposit to the resolver on its own event', async () => {
    const resolved: string[] = []
    await consumer(resolved).handleEvent(
      DEPOSIT_EVENT_BY_STATE.AwaitingVaultRequest.create(DEPOSIT_NAME, { name: DEPOSIT_NAME }),
    )
    expect(resolved).toEqual([DEPOSIT_NAME])
  })

  test("hands the parent to the resolver on a child's terminal event", async () => {
    const resolved: string[] = []
    await consumer(resolved).handleEvent(
      VAULT_REQUEST_EVENT_BY_STATE.Attested.create(VAULT_REQUEST_CHILD, {
        name: VAULT_REQUEST_CHILD,
        parent: DEPOSIT_NAME,
      }),
    )
    expect(resolved).toEqual([DEPOSIT_NAME])
  })

  test('refuses malformed event data before touching the resolver', async () => {
    const resolved: string[] = []
    await expect(
      consumer(resolved).handleEvent(
        newEvent(DEPOSIT_EVENT_BY_STATE.Completed.type, 'k', { name: 'nope' }),
      ),
    ).rejects.toThrow('is malformed')
    await expect(
      consumer(resolved).handleEvent(
        MIDNIGHT_TRANSACTION_EVENT_BY_STATE.Failed.create(MIDNIGHT_CHILD, {
          name: MIDNIGHT_CHILD,
          parent: VAULT_REQUEST_CHILD,
        }),
      ),
    ).rejects.toThrow('does not name a deposit')
    expect(resolved).toEqual([])
  })
})
