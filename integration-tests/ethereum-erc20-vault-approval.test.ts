import { nativeToken } from '@midnightntwrk/ledger-v9'
import { UNISWAP_SWAP_ROUTER_02 } from '@sig-net/midnight-examples-erc20-vault-contract'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { ApprovalRequest } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import type { Backend } from '@/server/backend'

import { testBackend } from './backend'
import { CIRCLE_USDC } from './sepolia-tokens'
import { deleteOperation, driveOperation, log } from './operation-round-trip'
import { completeApprovalAsUser, startApprovalAsUser } from './user-approval'
import { secretKeyOf } from './user-caller-call'
import { mergedBoundTx, startUserWallet, type UserWallet, userWalletSeed } from './user-wallet'

const ROUND_TRIP_TIMEOUT_MS = 30 * 60_000

/**
 * One router approval from `startApproval` to `Completed` over the whole local stack, under the
 * stack's user identity, which deployed the vault. This test plays the browser, which builds,
 * proves and binds both deployer calls without a fee, and the relayer pays each call's fee. The
 * vault account's allowance on the fork is read before and after, so the test proves the approve
 * call the MPC signed took effect. Before the round trip, bound bytes the relayer must not pay
 * for are offered to the server for each kind's start circuit and refused.
 */
describe('ERC20 vault approval round trip over the local stack', () => {
  let backend: Backend
  let user: UserWallet
  const callerSecret = userWalletSeed()
  const created: string[] = []

  beforeAll(async () => {
    backend = await testBackend()
    await backend.start()
    user = await startUserWallet(userWalletSeed(), backend.config.client.midnightNetwork)
  }, ROUND_TRIP_TIMEOUT_MS)

  afterAll(async () => {
    for (const name of created) {
      await deleteOperation(backend, 'midnight_ethereum_erc20_vault_approvals_v1', name)
    }
    await user.stop()
    await backend.stop()
    await backend.db.pool.end()
  }, ROUND_TRIP_TIMEOUT_MS)

  const kinds: ReadonlyArray<{ approvalRequest: ApprovalRequest; circuit: string }> = [
    {
      approvalRequest: { kind: 'router', erc20Address: CIRCLE_USDC },
      circuit: 'startApproveRouter',
    },
    { approvalRequest: { kind: 'stata' }, circuit: 'startApproveStata' },
  ]

  test.each(kinds)(
    'bound bytes the relayer must not pay for are refused for $circuit and write nothing',
    async ({ approvalRequest, circuit }) => {
      const { approvalV1 } = backend.midnight.ethereumErc20Vault
      const before = await approvalV1.adaptor.listApprovals(callerSecret, {})
      const prepared = await approvalV1.adaptor.prepareStartApproval(callerSecret, {
        approvalRequest,
      })
      if (!prepared.ok) throw new Error(prepared.error)
      const unboundStart = await approvalV1.callBuilder.buildStart({
        secretKey: secretKeyOf(callerSecret),
        wallet: user.publicKeys,
        inIndex: prepared.inputs.inIndex,
        ...approvalRequest,
      })
      const refusal = {
        ok: false,
        error: `the bound bytes must be exactly one ${circuit} call to the vault, spending no coins`,
      }

      // The user's wallet pays the fee itself, so the bytes carry a DUST spend.
      const withFee = await user.balance(unboundStart)
      expect(
        await approvalV1.adaptor.startApproval(callerSecret, {
          approvalRequest,
          inIndex: prepared.inputs.inIndex,
          boundTx: withFee,
        }),
      ).toEqual(refusal)
      await user.revert(withFee)

      // The call bound without a fee, with an unshielded NIGHT transfer merged beside it.
      const withoutFee = await user.balanceWithoutFee(unboundStart)
      const night = await user.selfTransfer('unshielded', nativeToken().raw, 1n)
      expect(
        await approvalV1.adaptor.startApproval(callerSecret, {
          approvalRequest,
          inIndex: prepared.inputs.inIndex,
          boundTx: mergedBoundTx(withoutFee, night),
        }),
      ).toEqual(refusal)
      await user.revert(night)
      await user.revert(withoutFee)

      expect(await approvalV1.adaptor.listApprovals(callerSecret, {})).toEqual(before)
    },
    ROUND_TRIP_TIMEOUT_MS,
  )

  test(
    'the router is granted an allowance on USDC',
    async () => {
      const { midnight } = backend
      const { service, repository } = midnight.ethereumErc20Vault.approvalV1
      const targetsBefore = await service.listApprovalTargets(
        { name: '', secretKey: new Uint8Array(32) },
        {},
      )
      const target = targetsBefore.find(
        (candidate) =>
          candidate.kind === 'router' && candidate.erc20Address === CIRCLE_USDC.toLowerCase(),
      )
      if (target === undefined) throw new Error('USDC is not an allowed token of the vault')
      expect(target.spender).toBe(UNISWAP_SWAP_ROUTER_02.toLowerCase())
      log(`router allowance on USDC before: ${target.allowance.toString()}`)

      const started = await startApprovalAsUser(backend, callerSecret, user, {
        kind: 'router',
        erc20Address: CIRCLE_USDC,
      })
      if (!started.ok) throw new Error(started.error)
      created.push(started.approval.name)
      expect(started.approval).toMatchObject({
        kind: 'router',
        spender: target.spender,
        state: 'AwaitingStartTransaction',
      })
      const [start] = await midnight.transactionV1.repository.search({
        criteria: [{ type: 'exact-text', field: 'parent', text: started.approval.name }],
      })
      expect(start).toMatchObject({
        circuit: 'startApproveRouter',
        signer: 'caller',
        unprovenTx: null,
      })
      expect(start?.boundTx).toMatch(/^[0-9a-f]+$/)

      await driveOperation(
        {
          name: started.approval.name,
          state: async () => (await repository.get(started.approval.name))?.state,
          complete: () =>
            completeApprovalAsUser(backend, callerSecret, user, started.approval.name),
        },
        ROUND_TRIP_TIMEOUT_MS,
      )

      const final = await repository.get(started.approval.name)
      expect(final?.outcome).toBe('approved')
      const targetsAfter = await service.listApprovalTargets(
        { name: '', secretKey: new Uint8Array(32) },
        {},
      )
      const granted = targetsAfter.find(
        (candidate) =>
          candidate.kind === 'router' && candidate.erc20Address === CIRCLE_USDC.toLowerCase(),
      )
      expect(granted?.allowance).toBe(2n ** 128n - 1n)
      const activity = await midnight.ethereumErc20Vault.activityV1.repository.get(
        started.approval.name,
      )
      expect(activity).toMatchObject({ type: 'Approval', state: 'Complete', outcome: 'approved' })

      // Both deployer calls were bound by the user and paid by the relayer.
      const transactions = await midnight.transactionV1.repository.search({
        criteria: [{ type: 'exact-text', field: 'parent', text: started.approval.name }],
        order: { field: 'createTime', direction: 'asc' },
      })
      expect(
        transactions.map(({ circuit, signer, state, unprovenTx }) => ({
          circuit,
          signer,
          state,
          unprovenTx,
        })),
      ).toEqual([
        { circuit: 'startApproveRouter', signer: 'caller', state: 'Succeeded', unprovenTx: null },
        { circuit: 'completeApprove', signer: 'caller', state: 'Succeeded', unprovenTx: null },
      ])
      const entries = await backend.event.outboxEntryV1.repository.search({
        criteria: [],
        order: { field: 'createdAt', direction: 'asc' },
      })
      for (const transaction of transactions) {
        const trail = entries
          .filter((entry) => new TextDecoder().decode(entry.data).includes(transaction.name))
          .map((entry) => entry.type.slice(entry.type.lastIndexOf('.') + 1))
        expect(trail).toEqual([
          'awaiting-fee',
          'awaiting-submission',
          'awaiting-inclusion',
          'succeeded',
        ])
      }
    },
    ROUND_TRIP_TIMEOUT_MS,
  )
})
