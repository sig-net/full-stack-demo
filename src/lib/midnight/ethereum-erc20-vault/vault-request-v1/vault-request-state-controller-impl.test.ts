import { describe, expect, test } from 'vitest'

import type { EthereumTransaction } from '@/lib/ethereum/transaction-v1/transaction'
import type { EthereumTransactionStateController } from '@/lib/ethereum/transaction-v1/transaction-state-controller'
import type { Event } from '@/lib/event/event'
import type { EventPublisher } from '@/lib/event/event-publisher'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import {
  ATTESTATION_FIELDS,
  CALLER_NAME,
  DEPOSIT_NAME,
  OUT_INDEX_HEX,
  REQUEST_ID_HEX,
  VAULT_REQUEST_IN_STATE,
  VAULT_REQUEST_NAME,
  vaultRequestFixture,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import {
  VAULT_REQUEST_EVENT_BY_STATE,
  VaultRequestStateConflict,
  type VaultRequestStateController,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import { VaultRequestStateControllerImpl } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller-impl'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import type { MidnightTransactionStateController } from '@/lib/midnight/transaction-v1/transaction-state-controller'
import { mock } from '@/lib/testing/mock'
import { SIGNED_TX } from '@/lib/ethereum/transaction-v1/transaction-fixtures'
import { UUID } from '@/lib/value-schemas'

interface Calls {
  created: VaultRequest[]
  updated: VaultRequest[]
  published: Event[]
  midnightChildren: MidnightTransaction[]
  ethereumChildren: EthereumTransaction[]
}

function emptyCalls(): Calls {
  return { created: [], updated: [], published: [], midnightChildren: [], ethereumChildren: [] }
}

/** A repository holding one row, a recording publisher, and child controllers that store what they are given. */
function controllerOver(
  stored: VaultRequest | undefined,
  calls: Calls,
  options: {
    locks?: string[]
    childError?: Error
    repository?: Partial<VaultRequestRepository>
  } = {},
): VaultRequestStateController {
  const commitChild =
    <Child>(into: Child[]) =>
    async ({ transaction }: { transaction: Child }): Promise<Child> => {
      if (options.childError !== undefined) throw options.childError
      into.push(transaction)
      return transaction
    }
  return new VaultRequestStateControllerImpl(
    mock<VaultRequestRepository>('VaultRequestRepository', {
      create: async (request) => {
        calls.created.push(request)
        return request
      },
      search: async (args) => {
        options.locks?.push(args.lock ?? 'none')
        expect(args.criteria).toEqual([
          { type: 'exact-text', field: 'name', text: VAULT_REQUEST_NAME },
        ])
        return stored === undefined ? [] : [stored]
      },
      update: async (request) => {
        calls.updated.push(request)
        return request
      },
      ...options.repository,
    }),
    mock<EventPublisher>('EventPublisher', {
      publishEvent: async (event) => {
        calls.published.push(event)
      },
    }),
    mock<MidnightTransactionStateController>('MidnightTransactionStateController', {
      commitTransaction: commitChild(calls.midnightChildren),
    }),
    mock<EthereumTransactionStateController>('EthereumTransactionStateController', {
      commitTransaction: commitChild(calls.ethereumChildren),
    }),
  )
}

describe('VaultRequestStateControllerImpl.queueRequest', () => {
  const cases: ReadonlyArray<{
    name: string
    args: VaultRequest
    repository?: Partial<VaultRequestRepository>
    check: (result: Promise<VaultRequest>, calls: Calls) => Promise<void>
  }> = [
    {
      name: 'success - AwaitingFlush with the queue-time fields',
      args: vaultRequestFixture({ createTime: new Date(0), updateTime: new Date(0) }),
      check: async (result, calls) => {
        const stored = await result
        expect(stored.createTime.getTime()).toBeGreaterThan(0)
        expect(stored.updateTime).toEqual(stored.createTime)
        expect(calls.created).toEqual([stored])
        expect(calls.published).toHaveLength(1)
        expect(calls.published[0]).toMatchObject({
          type: VAULT_REQUEST_EVENT_BY_STATE.AwaitingFlush.type,
          key: VAULT_REQUEST_NAME,
          data: { name: VAULT_REQUEST_NAME, parent: DEPOSIT_NAME },
        })
      },
    },
    {
      name: 'failure - a state a request cannot be queued in',
      args: VAULT_REQUEST_IN_STATE.AwaitingSend,
      check: async (result, calls) => {
        await expect(result).rejects.toThrow(
          `${VAULT_REQUEST_NAME} cannot be queued in state AwaitingSend`,
        )
        expect(calls.created).toHaveLength(0)
      },
    },
    {
      name: 'failure - AwaitingFlush with a field a later step produces',
      args: vaultRequestFixture({ requestId: REQUEST_ID_HEX }),
      check: async (result) => {
        await expect(result).rejects.toThrow('must have requestId unset')
      },
    },
    {
      name: 'failure - the repository refuses the row, so nothing is published',
      args: vaultRequestFixture(),
      repository: {
        create: async () => {
          throw new Error(`${VAULT_REQUEST_NAME} already exists`)
        },
      },
      check: async (result, calls) => {
        await expect(result).rejects.toThrow('already exists')
        expect(calls.published).toHaveLength(0)
      },
    },
  ]

  test.each(cases)('$name', async ({ args, repository, check }) => {
    const calls = emptyCalls()
    await check(
      controllerOver(undefined, calls, { repository }).queueRequest({ request: args }),
      calls,
    )
  })
})

describe('VaultRequestStateControllerImpl transitions', () => {
  type Transition = (controller: VaultRequestStateController) => Promise<VaultRequest>

  const cases: ReadonlyArray<{
    name: string
    from: VaultRequest
    transition: Transition
    to: VaultRequest['state']
    patch: Partial<VaultRequest>
  }> = [
    {
      name: 'recordFlushed',
      from: VAULT_REQUEST_IN_STATE.AwaitingFlush,
      transition: (c) => c.recordFlushed({ name: VAULT_REQUEST_NAME, outIndex: OUT_INDEX_HEX }),
      to: 'AwaitingSend',
      patch: { outIndex: OUT_INDEX_HEX },
    },
    {
      name: 'recordSent',
      from: VAULT_REQUEST_IN_STATE.AwaitingSend,
      transition: (c) => c.recordSent({ name: VAULT_REQUEST_NAME, requestId: REQUEST_ID_HEX }),
      to: 'AwaitingSignature',
      patch: { requestId: REQUEST_ID_HEX },
    },
    {
      name: 'recordSignature',
      from: VAULT_REQUEST_IN_STATE.AwaitingSignature,
      transition: (c) => c.recordSignature({ name: VAULT_REQUEST_NAME, signedTx: SIGNED_TX }),
      to: 'AwaitingBroadcast',
      patch: { signedTx: SIGNED_TX },
    },
    {
      name: 'recordBroadcast',
      from: VAULT_REQUEST_IN_STATE.AwaitingBroadcast,
      transition: (c) => c.recordBroadcast({ name: VAULT_REQUEST_NAME }),
      to: 'AwaitingAttestation',
      patch: {},
    },
    {
      name: 'recordAttestation',
      from: VAULT_REQUEST_IN_STATE.AwaitingAttestation,
      transition: (c) => c.recordAttestation({ name: VAULT_REQUEST_NAME, ...ATTESTATION_FIELDS }),
      to: 'AwaitingAttestationQueue',
      patch: ATTESTATION_FIELDS,
    },
    {
      name: 'recordAttestationQueued',
      from: VAULT_REQUEST_IN_STATE.AwaitingAttestationQueue,
      transition: (c) => c.recordAttestationQueued({ name: VAULT_REQUEST_NAME }),
      to: 'AwaitingAttestationFlush',
      patch: {},
    },
    {
      name: 'recordAttested',
      from: VAULT_REQUEST_IN_STATE.AwaitingAttestationFlush,
      transition: (c) => c.recordAttested({ name: VAULT_REQUEST_NAME }),
      to: 'Attested',
      patch: {},
    },
  ]

  test.each(cases)(
    '$name applies, locks the row and publishes the entered state',
    async ({ from, transition, to, patch }) => {
      const calls = emptyCalls()
      const locks: string[] = []
      const stored = await transition(controllerOver(from, calls, { locks }))
      expect(locks).toEqual(['update'])
      expect(stored).toEqual({ ...from, ...patch, state: to, updateTime: stored.updateTime })
      expect(stored.updateTime.getTime()).toBeGreaterThan(from.updateTime.getTime())
      expect(calls.updated).toEqual([stored])
      expect(calls.published).toHaveLength(1)
      expect(calls.published[0]).toMatchObject({
        type: VAULT_REQUEST_EVENT_BY_STATE[to].type,
        key: VAULT_REQUEST_NAME,
        data: { name: VAULT_REQUEST_NAME, parent: DEPOSIT_NAME },
      })
    },
  )

  const refused: ReadonlyArray<{ name: string; from: VaultRequest; transition: Transition }> = [
    {
      name: 'recordFlushed once already flushed',
      from: VAULT_REQUEST_IN_STATE.AwaitingSend,
      transition: (c) => c.recordFlushed({ name: VAULT_REQUEST_NAME, outIndex: OUT_INDEX_HEX }),
    },
    {
      name: 'recordSent before the flush',
      from: VAULT_REQUEST_IN_STATE.AwaitingFlush,
      transition: (c) => c.recordSent({ name: VAULT_REQUEST_NAME, requestId: REQUEST_ID_HEX }),
    },
    {
      name: 'recordAttested on a terminal request',
      from: VAULT_REQUEST_IN_STATE.Attested,
      transition: (c) => c.recordAttested({ name: VAULT_REQUEST_NAME }),
    },
  ]

  test.each(refused)(
    '$name is a state conflict that writes and publishes nothing',
    async ({ from, transition }) => {
      const calls = emptyCalls()
      await expect(transition(controllerOver(from, calls))).rejects.toBeInstanceOf(
        VaultRequestStateConflict,
      )
      expect(calls.updated).toHaveLength(0)
      expect(calls.published).toHaveLength(0)
    },
  )

  test('a transition on a missing request throws', async () => {
    const calls = emptyCalls()
    await expect(
      controllerOver(undefined, calls).recordAttested({ name: VAULT_REQUEST_NAME }),
    ).rejects.toThrow(`${VAULT_REQUEST_NAME} does not exist`)
  })
})

describe('VaultRequestStateControllerImpl child starters', () => {
  const MIDNIGHT_CHILD_NAME = new RegExp(`^${CALLER_NAME}/midnight-transactions/${UUID}$`)
  const ETHEREUM_CHILD_NAME = new RegExp(`^${CALLER_NAME}/ethereum-transactions/${UUID}$`)

  test('startSend commits the relayer send call under the request, leaving the row alone', async () => {
    const calls = emptyCalls()
    const locks: string[] = []
    const before = Date.now()
    const child = await controllerOver(VAULT_REQUEST_IN_STATE.AwaitingSend, calls, {
      locks,
    }).startSend({ name: VAULT_REQUEST_NAME, unprovenTx: 'send-call' })
    expect(locks).toEqual(['update'])
    expect(child).toMatchObject({
      parent: VAULT_REQUEST_NAME,
      state: 'AwaitingProof',
      circuit: 'sendDeposit',
      signer: 'relayer',
      unprovenTx: 'send-call',
      unboundTx: null,
      finalizedTx: null,
      txId: null,
      failure: null,
      error: null,
    })
    expect(child.name).toMatch(MIDNIGHT_CHILD_NAME)
    expect(child.expireTime?.getTime()).toBeGreaterThanOrEqual(before + 3_600_000)
    expect(calls.midnightChildren).toEqual([child])
    expect(calls.updated).toHaveLength(0)
    expect(calls.published).toHaveLength(0)
  })

  test('startBroadcast commits the signed transaction under the request without an expiry', async () => {
    const calls = emptyCalls()
    const child = await controllerOver(
      VAULT_REQUEST_IN_STATE.AwaitingBroadcast,
      calls,
    ).startBroadcast({ name: VAULT_REQUEST_NAME })
    expect(child).toMatchObject({
      parent: VAULT_REQUEST_NAME,
      state: 'AwaitingSubmission',
      signedTx: SIGNED_TX,
      txHash: null,
      blockNumber: null,
      expireTime: null,
      failure: null,
      error: null,
    })
    expect(child.name).toMatch(ETHEREUM_CHILD_NAME)
    expect(calls.ethereumChildren).toEqual([child])
    expect(calls.updated).toHaveLength(0)
  })

  const queueCircuits: ReadonlyArray<[string, string, string]> = [
    ['a one-byte output', ATTESTATION_FIELDS.attestationOutput, 'queueAttestation1'],
    ['the empty output', '', 'queueAttestation0'],
    ['a 32-byte output', 'ab'.repeat(32), 'queueAttestation32'],
  ]

  test.each(queueCircuits)(
    'startAttestationQueue commits the queue call for %s',
    async (_name, attestationOutput, circuit) => {
      const calls = emptyCalls()
      const child = await controllerOver(
        { ...VAULT_REQUEST_IN_STATE.AwaitingAttestationQueue, attestationOutput },
        calls,
      ).startAttestationQueue({ name: VAULT_REQUEST_NAME, unprovenTx: 'queue-call' })
      expect(child).toMatchObject({
        parent: VAULT_REQUEST_NAME,
        state: 'AwaitingProof',
        circuit,
        signer: 'relayer',
        unprovenTx: 'queue-call',
      })
      expect(calls.midnightChildren).toEqual([child])
    },
  )

  const wrongState: ReadonlyArray<{
    name: string
    from: VaultRequest
    start: (controller: VaultRequestStateController) => Promise<unknown>
  }> = [
    {
      name: 'startSend before the flush',
      from: VAULT_REQUEST_IN_STATE.AwaitingFlush,
      start: (c) => c.startSend({ name: VAULT_REQUEST_NAME, unprovenTx: 'x' }),
    },
    {
      name: 'startBroadcast before the signature',
      from: VAULT_REQUEST_IN_STATE.AwaitingSignature,
      start: (c) => c.startBroadcast({ name: VAULT_REQUEST_NAME }),
    },
    {
      name: 'startAttestationQueue before the attestation',
      from: VAULT_REQUEST_IN_STATE.AwaitingAttestation,
      start: (c) => c.startAttestationQueue({ name: VAULT_REQUEST_NAME, unprovenTx: 'x' }),
    },
  ]

  test.each(wrongState)(
    '$name is a state conflict that commits no child',
    async ({ from, start }) => {
      const calls = emptyCalls()
      await expect(start(controllerOver(from, calls))).rejects.toBeInstanceOf(
        VaultRequestStateConflict,
      )
      expect(calls.midnightChildren).toHaveLength(0)
      expect(calls.ethereumChildren).toHaveLength(0)
    },
  )

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
      const calls = emptyCalls()
      const starting = controllerOver(VAULT_REQUEST_IN_STATE.AwaitingSend, calls, {
        childError,
      }).startSend({ name: VAULT_REQUEST_NAME, unprovenTx: 'x' })
      if (outcome === 'conflict') {
        await expect(starting).rejects.toBeInstanceOf(VaultRequestStateConflict)
      } else {
        await expect(starting).rejects.toBe(childError)
      }
    },
  )
})
