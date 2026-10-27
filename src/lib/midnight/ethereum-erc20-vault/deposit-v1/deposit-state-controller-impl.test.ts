import { describe, expect, test } from 'vitest'

import type { Event } from '@/lib/event/event'
import type { EventPublisher } from '@/lib/event/event-publisher'
import type { Deposit } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import {
  CALLER_NAME,
  DEPOSIT_ACCOUNT,
  DEPOSIT_IN_STATE,
  DEPOSIT_NAME,
  ERC20_ADDRESS,
  IN_INDEX,
  RECIPIENT,
  USER_COMMITMENT,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-fixtures'
import type { DepositRepository } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-repository'
import {
  DEPOSIT_EVENT_BY_STATE,
  DepositStateConflict,
  type DepositStateController,
  type StartDepositArgs,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
import { DepositStateControllerImpl } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller-impl'
import { vaultRequestFixture } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import type {
  QueueRequestArgs,
  VaultRequestStateController,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import { transactionFixture } from '@/lib/midnight/transaction-v1/transaction-fixtures'
import type {
  CommitTransactionArgs,
  MidnightTransactionStateController,
} from '@/lib/midnight/transaction-v1/transaction-state-controller'
import { mock } from '@/lib/testing/mock'
import { UUID } from '@/lib/value-schemas'
import { RecordingLogger } from '@/lib/testing/recording-logger'

interface Calls {
  created: Deposit[]
  updated: Deposit[]
  published: Event[]
  /** What the deposit asked each child controller to commit. */
  transactions: CommitTransactionArgs[]
  requests: QueueRequestArgs[]
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
      commitTransaction: async (args) => {
        calls.transactions.push(args)
        return transactionFixture(args)
      },
    }),
    mock<VaultRequestStateController>('VaultRequestStateController', {
      queueRequest: async (args) => {
        calls.requests.push(args)
        return vaultRequestFixture(args)
      },
    }),
    new RecordingLogger(),
  )
}

const TRANSACTION_NAME = new RegExp(`^${CALLER_NAME}/midnight-transactions/${UUID}$`)
const VAULT_REQUEST_NAME = new RegExp(`^${CALLER_NAME}/ethereum-erc20-vault-requests/${UUID}$`)

describe('DepositStateControllerImpl.startDeposit', () => {
  const args: StartDepositArgs = {
    name: DEPOSIT_NAME,
    erc20Address: ERC20_ADDRESS,
    amount: 1_000_000n,
    inIndex: IN_INDEX,
    userCommitment: USER_COMMITMENT,
    evmNonce: 7n,
    gasLimit: 100_000n,
    maxFeePerGas: 30_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    depositAccount: DEPOSIT_ACCOUNT,
    recipient: RECIPIENT,
    call: { finalizedTx: 'start-call' },
  }

  const cases: ReadonlyArray<{
    name: string
    repository?: Partial<DepositRepository>
    check: (result: Promise<Deposit>, calls: Calls, before: number) => Promise<void>
  }> = [
    {
      name: 'success - the row in AwaitingStartTransaction, the caller start call under it and the event',
      check: async (result, calls, before) => {
        const stored = await result
        const { call, ...deposit } = args
        expect(stored).toEqual({
          ...deposit,
          state: 'AwaitingStartTransaction',
          outcome: null,
          failure: null,
          error: null,
          createTime: stored.createTime,
          updateTime: stored.createTime,
        })
        expect(stored.createTime.getTime()).toBeGreaterThanOrEqual(before)
        expect(calls.created).toEqual([stored])
        expect(calls.transactions).toEqual([
          {
            name: expect.stringMatching(TRANSACTION_NAME),
            parent: DEPOSIT_NAME,
            circuit: 'startDeposit',
            signer: 'caller',
            ...call,
          },
        ])
        expect(calls.published).toHaveLength(1)
        expect(calls.published[0]).toMatchObject({
          type: DEPOSIT_EVENT_BY_STATE.AwaitingStartTransaction.type,
          key: DEPOSIT_NAME,
          data: { name: DEPOSIT_NAME },
        })
      },
    },
    {
      name: 'failure - the repository refuses the row, so no child is committed and nothing is published',
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

  test.each(cases)('$name', async ({ repository, check }) => {
    const calls = emptyCalls()
    const before = Date.now()
    await check(controllerOver(undefined, calls, { repository }).startDeposit(args), calls, before)
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
        expect(calls.requests).toEqual([
          {
            name: expect.stringMatching(VAULT_REQUEST_NAME),
            parent: DEPOSIT_NAME,
            action: 'deposit',
            inIndex: IN_INDEX,
            signerAccount: DEPOSIT_ACCOUNT,
          },
        ])
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
      transition: (c) =>
        c.completeDeposit({ name: DEPOSIT_NAME, call: { finalizedTx: 'complete-call' } }),
      to: 'AwaitingCompleteTransaction',
      patch: {},
      check: (calls) => {
        expect(calls.transactions).toEqual([
          {
            name: expect.stringMatching(TRANSACTION_NAME),
            parent: DEPOSIT_NAME,
            circuit: 'completeDeposit',
            signer: 'caller',
            finalizedTx: 'complete-call',
          },
        ])
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
      name: 'recordCompleted while awaiting the user, the ledger having settled the complete',
      from: DEPOSIT_IN_STATE.AwaitingCompletion,
      transition: (c) => c.recordCompleted({ name: DEPOSIT_NAME, outcome: 'minted' }),
      to: 'Completed',
      patch: { outcome: 'minted' },
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
      transition: (c) => c.completeDeposit({ name: DEPOSIT_NAME, call: { finalizedTx: 'x' } }),
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
})
