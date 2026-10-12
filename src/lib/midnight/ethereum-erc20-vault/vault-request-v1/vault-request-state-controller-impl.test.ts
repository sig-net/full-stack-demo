import { describe, expect, test } from 'vitest'

import type { EthereumTransaction } from '@/lib/ethereum/transaction-v1/transaction'
import {
  transactionFixture as ethereumTransactionFixture,
  SIGNED_TX,
} from '@/lib/ethereum/transaction-v1/transaction-fixtures'
import type { EthereumTransactionRepository } from '@/lib/ethereum/transaction-v1/transaction-repository'
import type {
  CommitTransactionArgs as EthereumCommitTransactionArgs,
  EthereumTransactionStateController,
} from '@/lib/ethereum/transaction-v1/transaction-state-controller'
import type { Event } from '@/lib/event/event'
import type { EventPublisher } from '@/lib/event/event-publisher'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import {
  ATTESTATION_FIELDS,
  CALLER_NAME,
  DEPOSIT_ACCOUNT,
  DEPOSIT_NAME,
  IN_INDEX,
  OUT_INDEX_HEX,
  REQUEST_ID_HEX,
  VAULT_REQUEST_IN_STATE,
  VAULT_REQUEST_NAME,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import {
  type QueueRequestArgs,
  VAULT_REQUEST_EVENT_BY_STATE,
  VaultRequestStateConflict,
  type VaultRequestStateController,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import { VaultRequestStateControllerImpl } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller-impl'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import { transactionFixture as midnightTransactionFixture } from '@/lib/midnight/transaction-v1/transaction-fixtures'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import type {
  CommitTransactionArgs as MidnightCommitTransactionArgs,
  MidnightTransactionStateController,
} from '@/lib/midnight/transaction-v1/transaction-state-controller'
import { mock } from '@/lib/testing/mock'
import { UUID } from '@/lib/value-schemas'

interface Calls {
  created: VaultRequest[]
  updated: VaultRequest[]
  published: Event[]
  /** What the request asked each child controller to commit. */
  midnightChildren: MidnightCommitTransactionArgs[]
  ethereumChildren: EthereumCommitTransactionArgs[]
}

function emptyCalls(): Calls {
  return { created: [], updated: [], published: [], midnightChildren: [], ethereumChildren: [] }
}

/**
 * A repository holding one row, a recording publisher, child repositories holding the children a
 * case plants under the request, and child controllers that record what they are asked to commit.
 */
function controllerOver(
  stored: VaultRequest | undefined,
  calls: Calls,
  options: {
    locks?: string[]
    repository?: Partial<VaultRequestRepository>
    midnightChildren?: MidnightTransaction[]
    ethereumChildren?: EthereumTransaction[]
  } = {},
): VaultRequestStateController {
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
    mock<MidnightTransactionRepository>('MidnightTransactionRepository', {
      search: async (args) => {
        expect(args.criteria).toEqual([
          { type: 'exact-text', field: 'parent', text: VAULT_REQUEST_NAME },
          expect.objectContaining({ type: 'exact-text', field: 'circuit' }),
        ])
        const [, circuit] = args.criteria
        return (options.midnightChildren ?? []).filter(
          (child) => circuit?.type === 'exact-text' && child.circuit === circuit.text,
        )
      },
    }),
    mock<MidnightTransactionStateController>('MidnightTransactionStateController', {
      commitTransaction: async (args) => {
        calls.midnightChildren.push(args)
        return midnightTransactionFixture(args)
      },
    }),
    mock<EthereumTransactionRepository>('EthereumTransactionRepository', {
      search: async (args) => {
        expect(args.criteria).toEqual([
          { type: 'exact-text', field: 'parent', text: VAULT_REQUEST_NAME },
        ])
        return options.ethereumChildren ?? []
      },
    }),
    mock<EthereumTransactionStateController>('EthereumTransactionStateController', {
      commitTransaction: async (args) => {
        calls.ethereumChildren.push(args)
        return ethereumTransactionFixture(args)
      },
    }),
  )
}

describe('VaultRequestStateControllerImpl.queueRequest', () => {
  const args: QueueRequestArgs = {
    name: VAULT_REQUEST_NAME,
    parent: DEPOSIT_NAME,
    action: 'deposit',
    inIndex: IN_INDEX,
    depositAccount: DEPOSIT_ACCOUNT,
  }

  const cases: ReadonlyArray<{
    name: string
    repository?: Partial<VaultRequestRepository>
    check: (result: Promise<VaultRequest>, calls: Calls, before: number) => Promise<void>
  }> = [
    {
      name: 'success - stored in AwaitingFlush with every step field unset',
      check: async (result, calls, before) => {
        const stored = await result
        expect(stored).toEqual({
          ...args,
          state: 'AwaitingFlush',
          outIndex: null,
          requestId: null,
          signedTx: null,
          attestationBlockHeight: null,
          attestationOutputKind: null,
          attestationDigest: null,
          attestationSignature: null,
          attestationOutput: null,
          createTime: stored.createTime,
          updateTime: stored.createTime,
        })
        expect(stored.createTime.getTime()).toBeGreaterThanOrEqual(before)
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
      name: 'failure - the repository refuses the row, so nothing is published',
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

  test.each(cases)('$name', async ({ repository, check }) => {
    const calls = emptyCalls()
    const before = Date.now()
    await check(controllerOver(undefined, calls, { repository }).queueRequest(args), calls, before)
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
    const child = await controllerOver(VAULT_REQUEST_IN_STATE.AwaitingSend, calls, {
      locks,
    }).startSend({ name: VAULT_REQUEST_NAME, unprovenTx: 'send-call' })
    expect(locks).toEqual(['update'])
    expect(calls.midnightChildren).toEqual([
      {
        name: expect.stringMatching(MIDNIGHT_CHILD_NAME),
        parent: VAULT_REQUEST_NAME,
        circuit: 'sendDeposit',
        signer: 'relayer',
        unprovenTx: 'send-call',
      },
    ])
    expect(child.name).toBe(calls.midnightChildren[0]?.name)
    expect(calls.updated).toHaveLength(0)
    expect(calls.published).toHaveLength(0)
  })

  test('startBroadcast commits the signed transaction under the request without an expiry', async () => {
    const calls = emptyCalls()
    const child = await controllerOver(
      VAULT_REQUEST_IN_STATE.AwaitingBroadcast,
      calls,
    ).startBroadcast({ name: VAULT_REQUEST_NAME })
    expect(calls.ethereumChildren).toEqual([
      {
        name: expect.stringMatching(ETHEREUM_CHILD_NAME),
        parent: VAULT_REQUEST_NAME,
        signedTx: SIGNED_TX,
        expireTime: null,
      },
    ])
    expect(child.name).toBe(calls.ethereumChildren[0]?.name)
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
      expect(calls.midnightChildren).toHaveLength(1)
      expect(calls.midnightChildren[0]).toMatchObject({
        parent: VAULT_REQUEST_NAME,
        circuit,
        signer: 'relayer',
        unprovenTx: 'queue-call',
      })
      expect(child.name).toBe(calls.midnightChildren[0]?.name)
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

  const liveChild = midnightTransactionFixture({
    parent: VAULT_REQUEST_NAME,
    circuit: 'sendDeposit',
    signer: 'relayer',
  })

  const guarded: ReadonlyArray<{
    name: string
    from: VaultRequest
    midnightChildren?: MidnightTransaction[]
    ethereumChildren?: EthereumTransaction[]
    start: (controller: VaultRequestStateController) => Promise<unknown>
    expectCommitted: boolean
  }> = [
    {
      name: 'startSend with a live send call is a state conflict',
      from: VAULT_REQUEST_IN_STATE.AwaitingSend,
      midnightChildren: [liveChild],
      start: (c) => c.startSend({ name: VAULT_REQUEST_NAME, unprovenTx: 'x' }),
      expectCommitted: false,
    },
    {
      name: 'startSend after a send call that ended commits a new one',
      from: VAULT_REQUEST_IN_STATE.AwaitingSend,
      midnightChildren: [{ ...liveChild, state: 'Failed', failure: 'Rejected', error: 'invalid' }],
      start: (c) => c.startSend({ name: VAULT_REQUEST_NAME, unprovenTx: 'x' }),
      expectCommitted: true,
    },
    {
      name: 'startAttestationQueue is not blocked by a live call of another circuit',
      from: VAULT_REQUEST_IN_STATE.AwaitingAttestationQueue,
      midnightChildren: [liveChild],
      start: (c) => c.startAttestationQueue({ name: VAULT_REQUEST_NAME, unprovenTx: 'x' }),
      expectCommitted: true,
    },
    {
      name: 'startBroadcast with a live broadcast is a state conflict',
      from: VAULT_REQUEST_IN_STATE.AwaitingBroadcast,
      ethereumChildren: [ethereumTransactionFixture({ parent: VAULT_REQUEST_NAME })],
      start: (c) => c.startBroadcast({ name: VAULT_REQUEST_NAME }),
      expectCommitted: false,
    },
  ]

  test.each(guarded)(
    '$name',
    async ({ from, midnightChildren, ethereumChildren, start, expectCommitted }) => {
      const calls = emptyCalls()
      const starting = start(controllerOver(from, calls, { midnightChildren, ethereumChildren }))
      if (expectCommitted) {
        await starting
      } else {
        await expect(starting).rejects.toBeInstanceOf(VaultRequestStateConflict)
      }
      expect(calls.midnightChildren.length + calls.ethereumChildren.length).toBe(
        expectCommitted ? 1 : 0,
      )
    },
  )
})
