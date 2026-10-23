import { rawTokenType } from '@midnight-ntwrk/compact-runtime'
import {
  deriveVaultEvmAddress,
  evmAddressBytes,
  pureCircuits,
} from '@sig-net/midnight-examples-erc20-vault-contract'
import { Interface, JsonRpcProvider, toBigInt } from 'ethers'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Backend } from '@/server/backend'

import { testBackend } from './backend'
import { CIRCLE_EURC, CIRCLE_USDC } from './sepolia-tokens'
import { deleteOperation, driveOperation, log } from './operation-round-trip'
import { completeApprovalAsUser, startApprovalAsUser } from './user-approval'
import { completeDepositAsUser, startDepositAsUser } from './user-deposit'
import { completeSwapAsUser, startSwapAsUser } from './user-swap'
import { startUserWallet, type UserWallet, userWalletSeed } from './user-wallet'

const ROUND_TRIP_TIMEOUT_MS = 45 * 60_000
/** Whole USDC the swap may spend; the quote decides how much EURC that buys. */
const AMOUNT_IN = 2_000_000n

/**
 * One swap from `startSwap` to `Completed` over the whole local stack: the caller first deposits
 * the USDC it will surrender, the router allowance is granted when the vault account lacks it,
 * and the swap then sells that USDC for EURC at a live quote. This test plays the browser, which
 * builds, proves and finalises both caller calls of the deposit and the swap with the user wallet
 * paying their fees, and the wallet's own USDC coin funding the swap's start call. The vault
 * account's balances on the fork before and after prove the trade the MPC signed executed.
 */
describe('ERC20 vault swap round trip over the local stack', () => {
  let backend: Backend
  let user: UserWallet
  let evm: JsonRpcProvider
  const vaultSecret = userWalletSeed()
  const created: [string, string][] = []
  let coinType: string
  let deposited = false

  beforeAll(async () => {
    backend = await testBackend()
    await backend.start()
    evm = new JsonRpcProvider(backend.config.client.ethereum.rpcURL, undefined, {
      cacheTimeout: -1,
    })
    user = await startUserWallet(userWalletSeed(), backend.config.client.midnightNetwork)
    // Mirrors `vaultTokenType` in `vault-token-infos.ts`, which the boundary rule keeps out of a test.
    coinType = rawTokenType(
      pureCircuits.vaultTokenDomainSeparator(evmAddressBytes(CIRCLE_USDC)),
      backend.config.client.midnightEthereumErc20Vault.contractAddress,
    )
  }, ROUND_TRIP_TIMEOUT_MS)

  afterAll(async () => {
    for (const [table, name] of created) await deleteOperation(backend, table, name)
    await user.stop()
    await backend.stop()
    await backend.db.pool.end()
  }, ROUND_TRIP_TIMEOUT_MS)

  test(
    'the router is approved and a deposit gives the caller the USDC coin it will swap',
    async () => {
      const { midnight, ethereum } = backend
      const { approvalV1, depositV1 } = midnight.ethereumErc20Vault

      const targets = await approvalV1.adaptor.listApprovalTargets(await user.login(), {})
      if (!targets.ok) throw new Error(targets.error)
      const router = targets.targets.find(
        (target) => target.kind === 'router' && target.erc20Address === CIRCLE_USDC.toLowerCase(),
      )
      if (router === undefined) throw new Error('USDC is not an allowed token of the vault')
      if (router.allowance === 0n) {
        log('the router holds no allowance on USDC: approving first')
        const approval = await startApprovalAsUser(backend, vaultSecret, user, {
          kind: 'router',
          erc20Address: CIRCLE_USDC,
        })
        if (!approval.ok) throw new Error(approval.error)
        created.push(['midnight_ethereum_erc20_vault_approvals_v1', approval.approval.name])
        await driveOperation(
          {
            name: approval.approval.name,
            state: async () => (await approvalV1.repository.get(approval.approval.name))?.state,
            complete: () =>
              completeApprovalAsUser(backend, vaultSecret, user, approval.approval.name),
          },
          ROUND_TRIP_TIMEOUT_MS,
        )
      }

      const deposit = await startDepositAsUser(backend, vaultSecret, user, {
        erc20Address: CIRCLE_USDC,
        amount: AMOUNT_IN,
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
        {
          name: deposit.deposit.name,
          state: async () => (await depositV1.repository.get(deposit.deposit.name))?.state,
          complete: () => completeDepositAsUser(backend, vaultSecret, user, deposit.deposit.name),
        },
        ROUND_TRIP_TIMEOUT_MS,
      )
      expect((await depositV1.repository.get(deposit.deposit.name))?.outcome).toBe('minted')
      expect(await user.shieldedBalance(coinType)).toBeGreaterThanOrEqual(AMOUNT_IN)
      deposited = true
    },
    ROUND_TRIP_TIMEOUT_MS,
  )

  test(
    'USDC in the vault is swapped for EURC',
    async () => {
      if (!deposited) throw new Error('the deposit did not run')
      const { midnight } = backend
      const { swapV1 } = midnight.ethereumErc20Vault
      const { midnightSignet, midnightEthereumErc20Vault } = backend.config.client
      const vaultAccount = deriveVaultEvmAddress(
        midnightSignet.mpcRootPublicKey,
        midnightEthereumErc20Vault.contractAddress,
      ).toLowerCase()

      const quoted = await swapV1.adaptor.quoteSwap(await user.login(), {
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
      const coinsBefore = await user.shieldedBalance(coinType)

      const swap = await startSwapAsUser(backend, vaultSecret, user, {
        erc20AddressIn: quote.erc20AddressIn,
        erc20AddressOut: quote.erc20AddressOut,
        fee: quote.fee,
        amountOut: quote.amountOutMinimum,
        amountInMaximum: AMOUNT_IN,
      })
      if (!swap.ok) throw new Error(swap.error)
      created.push(['midnight_ethereum_erc20_vault_swaps_v1', swap.swap.name])
      expect(swap.swap).toMatchObject({
        amountInMaximum: AMOUNT_IN,
        state: 'AwaitingStartTransaction',
        vaultAccount,
      })
      const [start] = await midnight.transactionV1.repository.search({
        criteria: [{ type: 'exact-text', field: 'parent', text: swap.swap.name }],
      })
      expect(start).toMatchObject({ circuit: 'startSwap', signer: 'caller', unprovenTx: null })
      expect(start?.finalizedTx).toMatch(/^[0-9a-f]+$/)

      await driveOperation(
        {
          name: swap.swap.name,
          state: async () => (await swapV1.repository.get(swap.swap.name))?.state,
          complete: () => completeSwapAsUser(backend, vaultSecret, user, swap.swap.name),
        },
        ROUND_TRIP_TIMEOUT_MS,
      )

      expect((await swapV1.repository.get(swap.swap.name))?.outcome).toBe('swapped')
      const usdcAfter = await balanceOf(evm, CIRCLE_USDC, vaultAccount)
      const eurcAfter = await balanceOf(evm, CIRCLE_EURC, vaultAccount)
      expect(eurcAfter - eurcBefore).toBe(quote.amountOutMinimum)
      expect(usdcBefore - usdcAfter).toBeGreaterThan(0n)
      expect(usdcBefore - usdcAfter).toBeLessThanOrEqual(AMOUNT_IN)
      // The coin surrendered is AMOUNT_IN and the change minted back is what the trade left unspent.
      expect(coinsBefore - (await user.shieldedBalance(coinType))).toBe(usdcBefore - usdcAfter)
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

      // Both caller calls were finalised by the user's wallet.
      const transactions = await midnight.transactionV1.repository.search({
        criteria: [{ type: 'exact-text', field: 'parent', text: swap.swap.name }],
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
        { circuit: 'startSwap', signer: 'caller', state: 'Succeeded', unprovenTx: null },
        { circuit: 'completeSwap', signer: 'caller', state: 'Succeeded', unprovenTx: null },
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
