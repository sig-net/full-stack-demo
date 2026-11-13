import { describe, expect, test, vi } from 'vitest'

import { ETHEREUM_TRANSACTION_EVENT_BY_STATE } from '@/lib/ethereum/transaction-v1/transaction-state-controller'
import { type Event, newEvent } from '@/lib/event/event'
import { FlushEventConsumer } from '@/lib/midnight/ethereum-erc20-vault/flush-event-consumer'
import type { Flusher } from '@/lib/midnight/ethereum-erc20-vault/flusher'
import {
  DEPOSIT_NAME,
  VAULT_REQUEST_NAME,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import {
  VAULT_REQUEST_STATES,
  type VaultRequestState,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import { VAULT_REQUEST_EVENT_BY_STATE } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import { MIDNIGHT_TRANSACTION_EVENT_BY_STATE } from '@/lib/midnight/transaction-v1/transaction-state-controller'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

const WANTED_STATES: readonly VaultRequestState[] = ['AwaitingFlush', 'AwaitingAttestationFlush']

describe('FlushEventConsumer', () => {
  function consumer(flushes: { count: number } = { count: 0 }): FlushEventConsumer {
    return new FlushEventConsumer(
      mock<Flusher>('Flusher', {
        flush: async () => {
          flushes.count += 1
        },
      }),
      new RecordingLogger(),
    )
  }

  const ownEvents: [VaultRequestState, Event, boolean][] = VAULT_REQUEST_STATES.map(
    (state: VaultRequestState) => [
      state,
      VAULT_REQUEST_EVENT_BY_STATE[state].create(VAULT_REQUEST_NAME, {
        name: VAULT_REQUEST_NAME,
        parent: DEPOSIT_NAME,
      }),
      WANTED_STATES.includes(state),
    ],
  )

  test.each(ownEvents)('wants a vault request entering %s: %s', (_state, event, wanted) => {
    expect(consumer().wantsEvent(event)).toBe(wanted)
  })

  const otherEvents = [
    [
      'a Midnight transaction event',
      MIDNIGHT_TRANSACTION_EVENT_BY_STATE.Succeeded.create('t', {
        name: 't',
        parent: VAULT_REQUEST_NAME,
      }),
    ],
    [
      'an Ethereum transaction event',
      ETHEREUM_TRANSACTION_EVENT_BY_STATE.Succeeded.create('t', {
        name: 't',
        parent: VAULT_REQUEST_NAME,
      }),
    ],
    ['an unrelated event', newEvent('deposit.something', 'k', {})],
  ] as const

  test.each(otherEvents)('does not want %s', (_name, event) => {
    expect(consumer().wantsEvent(event)).toBe(false)
  })

  const wantedEvent = VAULT_REQUEST_EVENT_BY_STATE.AwaitingAttestationFlush.create(
    VAULT_REQUEST_NAME,
    { name: VAULT_REQUEST_NAME, parent: DEPOSIT_NAME },
  )

  test('flushes on a wanted event and returns before the flush ends', async () => {
    const flushes = { count: 0 }
    let endFlush = (): void => undefined
    const flushing = new Promise<void>((resolve) => {
      endFlush = resolve
    })
    const detached = new FlushEventConsumer(
      mock<Flusher>('Flusher', {
        flush: () => {
          flushes.count += 1
          return flushing
        },
      }),
      new RecordingLogger(),
    )
    await detached.handleEvent(wantedEvent)
    expect(flushes.count).toBe(1)
    endFlush()
  })

  test('a flush that fails is logged with the event that nudged it, and the handler still resolved', async () => {
    const logger = new RecordingLogger()
    const failing = new FlushEventConsumer(
      mock<Flusher>('Flusher', { flush: () => Promise.reject(new Error('wallet gone')) }),
      logger,
    )
    await failing.handleEvent(wantedEvent)
    await vi.waitFor(() => {
      expect(logger.at('error')).toMatchObject([
        {
          message: 'nudged flush failed',
          fields: {
            event: wantedEvent.type,
            eventId: wantedEvent.id,
            err: { message: 'wallet gone' },
          },
        },
      ])
    })
  })

  test('refuses malformed event data before touching the flusher', async () => {
    const flushes = { count: 0 }
    await expect(
      consumer(flushes).handleEvent(
        newEvent(VAULT_REQUEST_EVENT_BY_STATE.AwaitingFlush.type, 'k', { name: 'nope' }),
      ),
    ).rejects.toThrow('is malformed')
    expect(flushes.count).toBe(0)
  })
})
