import { UNISWAP_SWAP_ROUTER_02 } from '@sig-net/midnight-examples-erc20-vault-contract'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Caller } from '@/lib/caller/caller'
import type { Backend } from '@/server/backend'

import { testBackend } from './backend'
import { CIRCLE_USDC } from './sepolia-tokens'
import { deleteOperation, driveOperation, log } from './operation-round-trip'
import { completeApprovalAsUser, startApprovalAsUser } from './user-approval'
import { startUserWallet, type UserWallet, userWalletSeed } from './user-wallet'

/** The approval targets are vault-level, so the service reads nothing of the caller. */
const ANY_CALLER: Caller = { name: '', unshieldedAddress: '' }

const ROUND_TRIP_TIMEOUT_MS = 30 * 60_000

/**
 * One router approval from `startApproval` to `Completed` over the whole local stack, under the
 * stack's user identity, which deployed the vault. This test plays the browser, which builds,
 * proves and finalises both deployer calls with the user wallet paying their fees. The vault
 * account's allowance on the fork is read before and after, so the test proves the approve call
 * the MPC signed took effect.
 */
describe('ERC20 vault approval round trip over the local stack', () => {
  let backend: Backend
  let user: UserWallet
  const vaultSecret = userWalletSeed()
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

  test(
    'the router is granted an allowance on USDC',
    async () => {
      const { midnight } = backend
      const { service, repository } = midnight.ethereumErc20Vault.approvalV1
      const targetsBefore = await service.listApprovalTargets(ANY_CALLER, {})
      const target = targetsBefore.find(
        (candidate) =>
          candidate.kind === 'router' && candidate.erc20Address === CIRCLE_USDC.toLowerCase(),
      )
      if (target === undefined) throw new Error('USDC is not an allowed token of the vault')
      expect(target.spender).toBe(UNISWAP_SWAP_ROUTER_02.toLowerCase())
      log(`router allowance on USDC before: ${target.allowance.toString()}`)

      const started = await startApprovalAsUser(backend, vaultSecret, user, {
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
      expect(start?.finalizedTx).toMatch(/^[0-9a-f]+$/)

      await driveOperation(
        {
          name: started.approval.name,
          state: async () => (await repository.get(started.approval.name))?.state,
          complete: () => completeApprovalAsUser(backend, vaultSecret, user, started.approval.name),
        },
        ROUND_TRIP_TIMEOUT_MS,
      )

      const final = await repository.get(started.approval.name)
      expect(final?.outcome).toBe('approved')
      const targetsAfter = await service.listApprovalTargets(ANY_CALLER, {})
      const granted = targetsAfter.find(
        (candidate) =>
          candidate.kind === 'router' && candidate.erc20Address === CIRCLE_USDC.toLowerCase(),
      )
      expect(granted?.allowance).toBe(2n ** 128n - 1n)
      const activity = await midnight.ethereumErc20Vault.activityV1.repository.get(
        started.approval.name,
      )
      expect(activity).toMatchObject({ type: 'Approval', state: 'Complete', outcome: 'approved' })

      // Both deployer calls were finalised by the user's wallet.
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
        expect(trail).toEqual(['awaiting-submission', 'awaiting-inclusion', 'succeeded'])
      }
    },
    ROUND_TRIP_TIMEOUT_MS,
  )
})
