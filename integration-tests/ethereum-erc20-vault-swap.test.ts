import {
  CIRCLE_EURC,
  CIRCLE_USDC,
  deriveVaultEvmAddress,
} from '@sig-net/midnight-examples-erc20-vault-contract'
import { Interface, JsonRpcProvider, toBigInt } from 'ethers'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Backend } from '@/server/backend'

import { testBackend } from './backend'
import { deleteOperation, driveOperation, log } from './operation-round-trip'
import { startUserWallet, type UserWallet, userWalletSeed } from './user-wallet'

const ROUND_TRIP_TIMEOUT_MS = 45 * 60_000
/** Whole USDC the swap may spend; the quote decides how much EURC that buys. */
const AMOUNT_IN = 2_000_000n

/**
 * One swap from `startSwap` to `Completed` over the whole local stack: the caller first deposits
 * the USDC it will surrender, the router allowance is granted when the vault account lacks it,
 * and the swap then sells that USDC for EURC at a live quote. The vault account's balances on
 * the fork before and after prove the trade the MPC signed executed.
 */
describe('ERC20 vault swap round trip over the local stack', () => {
  let backend: Backend
  let user: UserWallet
  let evm: JsonRpcProvider
  const callerSecret = userWalletSeed()
  const created: [string, string][] = []

  beforeAll(async () => {
    backend = await testBackend()
    await backend.start()
    evm = new JsonRpcProvider(backend.config.client.ethereum.rpcURL, undefined, {
      cacheTimeout: -1,
    })
    user = await startUserWallet(userWalletSeed(), backend.config.client.midnightNetwork)
  }, ROUND_TRIP_TIMEOUT_MS)

  afterAll(async () => {
    for (const [table, name] of created) await deleteOperation(backend, table, name)
    await user.stop()
    await backend.stop()
    await backend.db.pool.end()
  }, ROUND_TRIP_TIMEOUT_MS)

  test(
    'USDC in the vault is swapped for EURC',
    async () => {
      const { midnight, ethereum } = backend
      const { approvalV1, depositV1, swapV1 } = midnight.ethereumErc20Vault
      const { midnightSignet, midnightEthereumErc20Vault } = backend.config.client
      const vaultAccount = deriveVaultEvmAddress(
        midnightSignet.mpcRootPublicKey,
        midnightEthereumErc20Vault.contractAddress,
      ).toLowerCase()
      const wallet = user.publicKeys

      const targets = await approvalV1.adaptor.listApprovalTargets(callerSecret, {})
      if (!targets.ok) throw new Error(targets.error)
      const router = targets.targets.find(
        (target) => target.kind === 'router' && target.erc20Address === CIRCLE_USDC.toLowerCase(),
      )
      if (router === undefined) throw new Error('USDC is not an allowed token of the vault')
      if (router.allowance === 0n) {
        log('the router holds no allowance on USDC: approving first')
        const approval = await approvalV1.adaptor.startApproval(callerSecret, {
          approvalRequest: { kind: 'router', erc20Address: CIRCLE_USDC },
          wallet,
        })
        if (!approval.ok) throw new Error(approval.error)
        created.push(['midnight_ethereum_erc20_vault_approvals_v1', approval.approval.name])
        await driveOperation(
          backend,
          callerSecret,
          user,
          {
            name: approval.approval.name,
            state: async () => (await approvalV1.repository.get(approval.approval.name))?.state,
            complete: () =>
              approvalV1.adaptor.completeApproval(callerSecret, {
                name: approval.approval.name,
                wallet,
              }),
          },
          ROUND_TRIP_TIMEOUT_MS,
        )
      }

      const deposit = await depositV1.adaptor.startDeposit(callerSecret, {
        depositRequest: { erc20Address: CIRCLE_USDC, amount: AMOUNT_IN },
        wallet,
      })
      if (!deposit.ok) throw new Error(deposit.error)
      created.push(['midnight_ethereum_erc20_vault_deposits_v1', deposit.deposit.name])
      const faucet = ethereum.localFaucetV1.service
      if (faucet === null) throw new Error('the swap test needs the local stack and its faucet')
      await faucet.fundAccount({ account: deposit.deposit.depositAccount })
      await faucet.fundErc20({
        account: deposit.deposit.depositAccount,
        erc20Address: CIRCLE_USDC.toLowerCase(),
        amount: AMOUNT_IN,
      })
      await driveOperation(
        backend,
        callerSecret,
        user,
        {
          name: deposit.deposit.name,
          state: async () => (await depositV1.repository.get(deposit.deposit.name))?.state,
          complete: () =>
            depositV1.adaptor.completeDeposit(callerSecret, { name: deposit.deposit.name, wallet }),
        },
        ROUND_TRIP_TIMEOUT_MS,
      )
      expect((await depositV1.repository.get(deposit.deposit.name))?.outcome).toBe('minted')

      const quoted = await swapV1.adaptor.quoteSwap(callerSecret, {
        erc20AddressIn: CIRCLE_USDC,
        erc20AddressOut: CIRCLE_EURC,
        amountIn: AMOUNT_IN,
      })
      if (!quoted.ok) throw new Error(quoted.error)
      const { quote } = quoted
      log(
        `quote: ${AMOUNT_IN.toString()} USDC buys ${quote.amountOut.toString()} EURC at the ${quote.fee.toString()} tier, at least ${quote.amountOutMinimum.toString()}`,
      )
      const usdcBefore = await balanceOf(evm, CIRCLE_USDC, vaultAccount)
      const eurcBefore = await balanceOf(evm, CIRCLE_EURC, vaultAccount)

      const swap = await swapV1.adaptor.startSwap(callerSecret, {
        swapRequest: {
          erc20AddressIn: quote.erc20AddressIn,
          erc20AddressOut: quote.erc20AddressOut,
          fee: quote.fee,
          amountOut: quote.amountOutMinimum,
          amountInMaximum: AMOUNT_IN,
        },
        wallet,
      })
      if (!swap.ok) throw new Error(swap.error)
      created.push(['midnight_ethereum_erc20_vault_swaps_v1', swap.swap.name])
      await driveOperation(
        backend,
        callerSecret,
        user,
        {
          name: swap.swap.name,
          state: async () => (await swapV1.repository.get(swap.swap.name))?.state,
          complete: () =>
            swapV1.adaptor.completeSwap(callerSecret, { name: swap.swap.name, wallet }),
        },
        ROUND_TRIP_TIMEOUT_MS,
      )

      expect((await swapV1.repository.get(swap.swap.name))?.outcome).toBe('swapped')
      const usdcAfter = await balanceOf(evm, CIRCLE_USDC, vaultAccount)
      const eurcAfter = await balanceOf(evm, CIRCLE_EURC, vaultAccount)
      expect(eurcAfter - eurcBefore).toBe(quote.amountOutMinimum)
      expect(usdcBefore - usdcAfter).toBeGreaterThan(0n)
      expect(usdcBefore - usdcAfter).toBeLessThanOrEqual(AMOUNT_IN)
      const [request] = await midnight.ethereumErc20Vault.vaultRequestV1.repository.search({
        criteria: [{ type: 'exact-text', field: 'parent', text: swap.swap.name }],
      })
      expect(request).toMatchObject({
        action: 'swap',
        state: 'Attested',
        signerAccount: vaultAccount,
        attestationOutputKind: 'executed',
      })
      const activity = await midnight.ethereumErc20Vault.activityV1.repository.get(swap.swap.name)
      expect(activity).toMatchObject({
        type: 'Swap',
        state: 'Complete',
        outcome: 'swapped',
        amount: AMOUNT_IN,
        amountOut: quote.amountOutMinimum,
      })
    },
    ROUND_TRIP_TIMEOUT_MS,
  )
})

const ERC20 = new Interface(['function balanceOf(address) view returns (uint256)'])

async function balanceOf(
  provider: JsonRpcProvider,
  erc20Address: string,
  holder: string,
): Promise<bigint> {
  return toBigInt(
    await provider.call({
      to: erc20Address,
      data: ERC20.encodeFunctionData('balanceOf', [holder]),
    }),
  )
}
