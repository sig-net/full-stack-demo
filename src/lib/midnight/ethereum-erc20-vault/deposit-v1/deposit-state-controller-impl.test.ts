import { describe, expect, test } from 'vitest'

import type { Event } from '@/lib/event/event'
import type { EventPublisher } from '@/lib/event/event-publisher'
import type { Deposit } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import {
  CALLER_NAME,
  DEPOSIT_ACCOUNT,
  DEPOSIT_IN_STATE,
  DEPOSIT_NAME,
  depositFixture,
  IN_INDEX,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-fixtures'
import type { DepositRepository } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-repository'
import {
  DEPOSIT_EVENT_BY_STATE,
  DepositStateConflict,
  type DepositStateController,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
import { DepositStateControllerImpl } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller-impl'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { VaultRequestStateController } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import type { MidnightTransactionStateController } from '@/lib/midnight/transaction-v1/transaction-state-controller'
import { mock } from '@/lib/testing/mock'
import { UUID } from '@/lib/value-schemas'

interface Calls {
  created: Deposit[]
  updated: Deposit[]
  published: Event[]
  transactions: MidnightTransaction[]
  requests: VaultRequest[]
}

function emptyCalls(): Calls {
  return { created: [], updated: [], published: [], transactions: [], requests: [] }
}

/** A repository holding one row, a recording publisher, and child controllers that store what they are given. */
function controllerOver(
  stored: Deposit | undefined,
  calls: Calls,
  options: {
    locks?: string[]
    childError?: Error
    repository?: Partial<DepositRepository>
  } = {},
): DepositStateController {
  return new DepositStateControllerImpl(
    mock<DepositRepository>('DepositRepository', {
      create: async (deposit) => {
        calls.created.push(deposit)
        return deposit
      },
      search: async (args) => {
        options.locks?.push(args.lock ?? 'none')
        expect(args.criteria).toEqual([{ type: 'exact-text', field: 'name', text: DEPOSIT_NAME }])
        return stored === undefined ? [] : [stored]
      },
      update: async (deposit) => {
        calls.updated.push(deposit)
        return deposit
      },
      ...options.repository,
    }),
    mock<EventPublisher>('EventPublisher', {
      publishEvent: async (event) => {
        calls.published.push(event)
      },
    }),
    mock<MidnightTransactionStateController>('MidnightTransactionStateController', {
      commitTransaction: async ({ transaction }) => {
        if (options.childError !== undefined) throw options.childError
        calls.transactions.push(transaction)
        return transaction
      },
    }),
    mock<VaultRequestStateController>('VaultRequestStateController', {
      queueRequest: async ({ request }) => {
        if (options.childError !== undefined) throw options.childError
        calls.requests.push(request)
        return request
      },
    }),
  )
}

const TRANSACTION_NAME = new RegExp(`^${CALLER_NAME}/midnight-transactions/${UUID}$`)
const VAULT_REQUEST_NAME = new RegExp(`^${CALLER_NAME}/ethereum-erc20-vault-requests/${UUID}$`)

describe('DepositStateControllerImpl.startDeposit', () => {
  const cases: ReadonlyArray<{
    name: string
    deposit: Deposit
    repository?: Partial<DepositRepository>
    check: (result: Promise<Deposit>, calls: Calls) => Promise<void>
  }> = [
    {
      name: 'success - the row, the caller start call under it and the event',
      deposit: depositFixture({ createTime: new Date(0), updateTime: new Date(0) }),
      check: async (result, calls) => {
        const before = Date.now()
        const stored = await result
        expect(stored.createTime.getTime()).toBeGreaterThan(0)
        expect(stored.updateTime).toEqual(stored.createTime)
        expect(calls.created).toEqual([stored])
        expect(calls.transactions).toHaveLength(1)
        const [transaction] = calls.transactions
        expect(transaction).toMatchObject({
          parent: DEPOSIT_NAME,
          state: 'AwaitingProof',
          circuit: 'startDeposit',
          signer: 'caller',
          unprovenTx: 'start-call',
          unboundTx: null,
          finalizedTx: null,
          txId: null,
          failure: null,
          error: null,
        })
        expect(transaction?.name).toMatch(TRANSACTION_NAME)
        expect(transaction?.expireTime?.getTime()).toBeGreaterThanOrEqual(before + 3_600_000)
        expect(calls.published).toHaveLength(1)
        expect(calls.published[0]).toMatchObject({
          type: DEPOSIT_EVENT_BY_STATE.AwaitingStartTransaction.type,
          key: DEPOSIT_NAME,
          data: { name: DEPOSIT_NAME },
        })
      },
    },
    {
      name: 'failure - a state a deposit cannot be started in',
      deposit: DEPOSIT_IN_STATE.AwaitingCompletion,
      check: async (result, calls) => {
        await expect(result).rejects.toThrow(
          `${DEPOSIT_NAME} cannot be started in state AwaitingCompletion`,
        )
        expect(calls.created).toHaveLength(0)
        expect(calls.transactions).toHaveLength(0)
      },
    },
    {
      name: 'failure - a field a later step produces',
      deposit: depositFixture({ outcome: 'minted' }),
      check: async (result) => {
        await expect(result).rejects.toThrow('must have outcome unset')
      },
    },
    {
      name: 'failure - the repository refuses the row, so no child is committed and nothing is published',
      deposit: depositFixture(),
      repository: {
        create: async () => {
          throw new Error(`${DEPOSIT_NAME} already exists`)
        },
      },
      check: async (result, calls) => {
        await expect(result).rejects.toThrow('already exists')
        expect(calls.transactions).toHaveLength(0)
        expect(calls.published).toHaveLength(0)
      },
    },
  ]

  test.each(cases)('$name', async ({ deposit, repository, check }) => {
    const calls = emptyCalls()
    await check(
      controllerOver(undefined, calls, { repository }).startDeposit({
        deposit,
        unprovenTx: 'start-call',
      }),
      calls,
    )
  })
})

describe('DepositStateControllerImpl transitions', () => {
  type Transition = (controller: DepositStateController) => Promise<Deposit>

  const cases: ReadonlyArray<{
    name: string
    from: Deposit
    transition: Transition
    to: Deposit['state']
    patch: Partial<Deposit>
    check?: (calls: Calls) => void
  }> = [
    {
      name: 'recordStarted',
      from: DEPOSIT_IN_STATE.AwaitingStartTransaction,
      transition: (c) => c.recordStarted({ name: DEPOSIT_NAME }),
      to: 'AwaitingVaultRequest',
      patch: {},
      check: (calls) => {
        expect(calls.requests).toHaveLength(1)
        expect(calls.requests[0]).toMatchObject({
          parent: DEPOSIT_NAME,
          action: 'deposit',
          state: 'AwaitingFlush',
          inIndex: IN_INDEX,
          depositAccount: DEPOSIT_ACCOUNT,
          outIndex: null,
          requestId: null,
          signedTx: null,
          attestationBlockHeight: null,
          attestationOutputKind: null,
          attestationDigest: null,
          attestationSignature: null,
          attestationOutput: null,
        })
        expect(calls.requests[0]?.name).toMatch(VAULT_REQUEST_NAME)
      },
    },
    {
      name: 'recordStartFailure',
      from: DEPOSIT_IN_STATE.AwaitingStartTransaction,
      transition: (c) => c.recordStartFailure({ name: DEPOSIT_NAME, error: 'boom' }),
      to: 'Failed',
      patch: { failure: 'StartFailed', error: 'boom' },
    },
    {
      name: 'recordAttested',
      from: DEPOSIT_IN_STATE.AwaitingVaultRequest,
      transition: (c) => c.recordAttested({ name: DEPOSIT_NAME }),
      to: 'AwaitingCompletion',
      patch: {},
    },
    {
      name: 'completeDeposit',
      from: DEPOSIT_IN_STATE.AwaitingCompletion,
      transition: (c) => c.completeDeposit({ name: DEPOSIT_NAME, unprovenTx: 'complete-call' }),
      to: 'AwaitingCompleteTransaction',
      patch: {},
      check: (calls) => {
        expect(calls.transactions).toHaveLength(1)
        expect(calls.transactions[0]).toMatchObject({
          parent: DEPOSIT_NAME,
          state: 'AwaitingProof',
          circuit: 'completeDeposit',
          signer: 'caller',
          unprovenTx: 'complete-call',
        })
        expect(calls.transactions[0]?.name).toMatch(TRANSACTION_NAME)
      },
    },
    {
      name: 'recordCompleted',
      from: DEPOSIT_IN_STATE.AwaitingCompleteTransaction,
      transition: (c) => c.recordCompleted({ name: DEPOSIT_NAME, outcome: 'closed' }),
      to: 'Completed',
      patch: { outcome: 'closed' },
    },
    {
      name: 'recordCompleteFailure',
      from: DEPOSIT_IN_STATE.AwaitingCompleteTransaction,
      transition: (c) => c.recordCompleteFailure({ name: DEPOSIT_NAME }),
      to: 'AwaitingCompletion',
      patch: {},
    },
  ]

  test.each(cases)(
    '$name applies, locks the row and publishes the entered state',
    async ({ from, transition, to, patch, check }) => {
      const calls = emptyCalls()
      const locks: string[] = []
      const stored = await transition(controllerOver(from, calls, { locks }))
      expect(locks).toEqual(['update'])
      expect(stored).toEqual({ ...from, ...patch, state: to, updateTime: stored.updateTime })
      expect(stored.updateTime.getTime()).toBeGreaterThan(from.updateTime.getTime())
      expect(calls.updated).toEqual([stored])
      expect(calls.published).toHaveLength(1)
      expect(calls.published[0]).toMatchObject({
        type: DEPOSIT_EVENT_BY_STATE[to].type,
        key: DEPOSIT_NAME,
        data: { name: DEPOSIT_NAME },
      })
      check?.(calls)
    },
  )

  const refused: ReadonlyArray<{ name: string; from: Deposit; transition: Transition }> = [
    {
      name: 'recordStarted once started',
      from: DEPOSIT_IN_STATE.AwaitingVaultRequest,
      transition: (c) => c.recordStarted({ name: DEPOSIT_NAME }),
    },
    {
      name: 'completeDeposit before the request is attested',
      from: DEPOSIT_IN_STATE.AwaitingVaultRequest,
      transition: (c) => c.completeDeposit({ name: DEPOSIT_NAME, unprovenTx: 'x' }),
    },
    {
      name: 'recordCompleted on a terminal deposit',
      from: DEPOSIT_IN_STATE.Completed,
      transition: (c) => c.recordCompleted({ name: DEPOSIT_NAME, outcome: 'minted' }),
    },
  ]

  test.each(refused)(
    '$name is a state conflict that writes, commits and publishes nothing',
    async ({ from, transition }) => {
      const calls = emptyCalls()
      await expect(transition(controllerOver(from, calls))).rejects.toBeInstanceOf(
        DepositStateConflict,
      )
      expect(calls.updated).toHaveLength(0)
      expect(calls.transactions).toHaveLength(0)
      expect(calls.requests).toHaveLength(0)
      expect(calls.published).toHaveLength(0)
    },
  )

  test('a transition on a missing deposit throws', async () => {
    const calls = emptyCalls()
    await expect(
      controllerOver(undefined, calls).recordAttested({ name: DEPOSIT_NAME }),
    ).rejects.toThrow(`${DEPOSIT_NAME} does not exist`)
  })

  const uniqueViolation = Object.assign(new Error('duplicate key value'), { code: '23505' })

  const childErrors: ReadonlyArray<[string, Error, 'conflict' | 'rethrown']> = [
    ['a unique violation from pg', uniqueViolation, 'conflict'],
    [
      'a unique violation wrapped as the cause of a query error',
      new Error('Failed query', { cause: uniqueViolation }),
      'conflict',
    ],
    ['any other error', new Error('connection lost'), 'rethrown'],
  ]

  test.each(childErrors)(
    "the child's live index refusing the row is a state conflict: %s",
    async (_name, childError, outcome) => {
      const queueing = controllerOver(DEPOSIT_IN_STATE.AwaitingStartTransaction, emptyCalls(), {
        childError,
      }).recordStarted({ name: DEPOSIT_NAME })
      const committing = controllerOver(DEPOSIT_IN_STATE.AwaitingCompletion, emptyCalls(), {
        childError,
      }).completeDeposit({ name: DEPOSIT_NAME, unprovenTx: 'x' })
      for (const starting of [queueing, committing]) {
        if (outcome === 'conflict') {
          await expect(starting).rejects.toBeInstanceOf(DepositStateConflict)
        } else {
          await expect(starting).rejects.toBe(childError)
        }
      }
    },
  )
})
