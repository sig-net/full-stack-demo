import {
  CIRCLE_USDC,
  UNISWAP_SWAP_ROUTER_02,
} from '@sig-net/midnight-examples-erc20-vault-contract'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Backend } from '@/server/backend'

import { testBackend } from './backend'
import { deleteOperation, driveOperation, log } from './operation-round-trip'
import { startUserWallet, type UserWallet, userWalletSeed } from './user-wallet'

const ROUND_TRIP_TIMEOUT_MS = 30 * 60_000

/**
 * One router approval from `startApproval` to `Completed` over the whole local stack, under the
 * stack's user identity, which deployed the vault. The vault account's allowance on the fork is
 * read before and after, so the test proves the approve call the MPC signed took effect.
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

  test(
    'the router is granted an allowance on USDC',
    async () => {
      const { adaptor, service, repository } = backend.midnight.ethereumErc20Vault.approvalV1
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

      const started = await adaptor.startApproval(callerSecret, {
        approvalRequest: { kind: 'router', erc20Address: CIRCLE_USDC },
        wallet: user.publicKeys,
      })
      expect(started.ok).toBe(true)
      if (!started.ok) return
      created.push(started.approval.name)
      expect(started.approval).toMatchObject({ kind: 'router', spender: target.spender })

      await driveOperation(
        backend,
        callerSecret,
        user,
        {
          name: started.approval.name,
          state: async () => (await repository.get(started.approval.name))?.state,
          complete: () =>
            adaptor.completeApproval(callerSecret, {
              name: started.approval.name,
              wallet: user.publicKeys,
            }),
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
      const activity = await backend.midnight.ethereumErc20Vault.activityV1.repository.get(
        started.approval.name,
      )
      expect(activity).toMatchObject({ type: 'Approval', state: 'Complete', outcome: 'approved' })
    },
    ROUND_TRIP_TIMEOUT_MS,
  )
})
