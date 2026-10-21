import { rawTokenType } from '@midnight-ntwrk/compact-runtime'
import {
  deriveVaultEvmAddress,
  evmAddressBytes,
  pureCircuits,
} from '@sig-net/midnight-examples-erc20-vault-contract'
import { Interface, JsonRpcProvider, toBigInt } from 'ethers'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Redeem } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import type { Backend } from '@/server/backend'

import { ensureAaveReserveAcceptsDeposits } from './aave-reserve'
import { testBackend } from './backend'
import { deleteOperation, driveOperation, log } from './operation-round-trip'
import { completeApprovalAsUser, startApprovalAsUser } from './user-approval'
import { completeDepositAsUser, startDepositAsUser } from './user-deposit'
import { completeSupplyAsUser, startSupplyAsUser } from './user-supply'
import { completeRedeemAsUser, startRedeemAsUser } from './user-redeem'
import { startUserWallet, type UserWallet, userWalletSeed } from './user-wallet'

const ROUND_TRIP_TIMEOUT_MS = 60 * 60_000
/** Whole underlying deposited and supplied, whose shares are then redeemed. */
const AMOUNT = 1_500_000n

/**
 * One redeem from `startRedeem` to `Completed` over the whole local stack: the caller deposits
 * the stata underlying, supplies it to Aave's static wrapper (approving the wrapper first when
 * the vault account lacks the allowance), then redeems the shares that supply minted. This test
 * plays the browser, which builds, proves and finalises the deposit's and the redeem's caller
 * calls with the user wallet paying their fees, and the wallet's own coin of the shares funding
 * the redeem's start call. The vault account's balances on the fork before and after prove the
 * redeem the MPC signed executed, and the attested output is the underlying the wrapper paid out.
 */
describe('ERC20 vault redeem round trip over the local stack', () => {
  let backend: Backend
  let user: UserWallet
  let evm: JsonRpcProvider
  let vaultAccount: string
  const callerSecret = userWalletSeed()
  const created: [string, string][] = []
  let pair: Pick<Redeem, 'underlyingErc20Address' | 'stataErc20Address'> | undefined
  let shares: bigint | undefined

  beforeAll(async () => {
    backend = await testBackend()
    await backend.start()
    evm = new JsonRpcProvider(backend.config.client.ethereum.rpcURL, undefined, {
      cacheTimeout: -1,
    })
    user = await startUserWallet(userWalletSeed(), backend.config.client.midnightNetwork)
    const { midnightSignet, midnightEthereumErc20Vault } = backend.config.client
    vaultAccount = deriveVaultEvmAddress(
      midnightSignet.mpcRootPublicKey,
      midnightEthereumErc20Vault.contractAddress,
    ).toLowerCase()
  }, ROUND_TRIP_TIMEOUT_MS)

  afterAll(async () => {
    for (const [table, name] of created) await deleteOperation(backend, table, name)
    await user.stop()
    await backend.stop()
    await backend.db.pool.end()
  }, ROUND_TRIP_TIMEOUT_MS)

  test(
    'a deposit and a supply give the caller the shares it will redeem',
    async () => {
      const { approvalV1, depositV1, supplyV1 } = backend.midnight.ethereumErc20Vault

      const targeted = await supplyV1.adaptor.getSupplyTarget(callerSecret, {})
      if (!targeted.ok) throw new Error(targeted.error)
      const { underlyingErc20Address, stataErc20Address } = targeted.target
      await ensureAaveReserveAcceptsDeposits(evm, stataErc20Address)
      if (targeted.target.allowance === 0n) {
        log('the wrapper holds no allowance on the underlying: approving first')
        const approval = await startApprovalAsUser(backend, callerSecret, user, { kind: 'stata' })
        if (!approval.ok) throw new Error(approval.error)
        created.push(['midnight_ethereum_erc20_vault_approvals_v1', approval.approval.name])
        await driveOperation(
          {
            name: approval.approval.name,
            state: async () => (await approvalV1.repository.get(approval.approval.name))?.state,
            complete: () =>
              completeApprovalAsUser(backend, callerSecret, user, approval.approval.name),
          },
          ROUND_TRIP_TIMEOUT_MS,
        )
      }

      const deposit = await startDepositAsUser(backend, callerSecret, user, {
        erc20Address: underlyingErc20Address,
        amount: AMOUNT,
      })
      if (!deposit.ok) throw new Error(deposit.error)
      created.push(['midnight_ethereum_erc20_vault_deposits_v1', deposit.deposit.name])
      const faucet = backend.ethereum.localFaucetV1.service
      if (faucet === null) throw new Error('the redeem test needs the local stack and its faucet')
      await faucet.fundAccount({ account: deposit.deposit.depositAccount })
      await faucet.fundErc20({
        account: deposit.deposit.depositAccount,
        erc20Address: underlyingErc20Address,
        amount: AMOUNT,
      })
      await driveOperation(
        {
          name: deposit.deposit.name,
          state: async () => (await depositV1.repository.get(deposit.deposit.name))?.state,
          complete: () => completeDepositAsUser(backend, callerSecret, user, deposit.deposit.name),
        },
        ROUND_TRIP_TIMEOUT_MS,
      )
      expect((await depositV1.repository.get(deposit.deposit.name))?.outcome).toBe('minted')

      const sharesBeforeSupply = await balanceOf(evm, stataErc20Address, vaultAccount)
      const supply = await startSupplyAsUser(backend, callerSecret, user, { amount: AMOUNT })
      if (!supply.ok) throw new Error(supply.error)
      created.push(['midnight_ethereum_erc20_vault_supplies_v1', supply.supply.name])
      await driveOperation(
        {
          name: supply.supply.name,
          state: async () => (await supplyV1.repository.get(supply.supply.name))?.state,
          complete: () => completeSupplyAsUser(backend, callerSecret, user, supply.supply.name),
        },
        ROUND_TRIP_TIMEOUT_MS,
      )
      expect((await supplyV1.repository.get(supply.supply.name))?.outcome).toBe('supplied')
      const minted = (await balanceOf(evm, stataErc20Address, vaultAccount)) - sharesBeforeSupply
      expect(minted).toBeGreaterThan(0n)
      expect(await user.shieldedBalance(sharesCoinType(stataErc20Address))).toBeGreaterThanOrEqual(
        minted,
      )
      pair = { underlyingErc20Address, stataErc20Address }
      shares = minted
    },
    ROUND_TRIP_TIMEOUT_MS,
  )

  test(
    'shares of the Aave wrapper in the vault are redeemed for the underlying',
    async () => {
      if (pair === undefined || shares === undefined) throw new Error('the supply did not run')
      const { underlyingErc20Address, stataErc20Address } = pair
      const { midnight } = backend
      const { redeemV1 } = midnight.ethereumErc20Vault
      const coinType = sharesCoinType(stataErc20Address)

      const underlyingBefore = await balanceOf(evm, underlyingErc20Address, vaultAccount)
      const sharesBefore = await balanceOf(evm, stataErc20Address, vaultAccount)
      const coinsBefore = await user.shieldedBalance(coinType)
      log(`redeeming ${shares.toString()} shares of ${stataErc20Address} for the underlying`)
      const redeem = await startRedeemAsUser(backend, callerSecret, user, { shares })
      if (!redeem.ok) throw new Error(redeem.error)
      created.push(['midnight_ethereum_erc20_vault_redeems_v1', redeem.redeem.name])
      expect(redeem.redeem).toMatchObject({
        stataErc20Address,
        underlyingErc20Address,
        shares,
        state: 'AwaitingStartTransaction',
        vaultAccount,
        outcome: null,
        failure: null,
        error: null,
      })
      const [start] = await midnight.transactionV1.repository.search({
        criteria: [{ type: 'exact-text', field: 'parent', text: redeem.redeem.name }],
      })
      expect(start).toMatchObject({ circuit: 'startRedeem', signer: 'caller', unprovenTx: null })
      expect(start?.finalizedTx).toMatch(/^[0-9a-f]+$/)

      await driveOperation(
        {
          name: redeem.redeem.name,
          state: async () => (await redeemV1.repository.get(redeem.redeem.name))?.state,
          complete: () => completeRedeemAsUser(backend, callerSecret, user, redeem.redeem.name),
        },
        ROUND_TRIP_TIMEOUT_MS,
      )

      expect((await redeemV1.repository.get(redeem.redeem.name))?.outcome).toBe('redeemed')
      expect(sharesBefore - (await balanceOf(evm, stataErc20Address, vaultAccount))).toBe(shares)
      expect(coinsBefore - (await user.shieldedBalance(coinType))).toBe(shares)
      const assetsPaid =
        (await balanceOf(evm, underlyingErc20Address, vaultAccount)) - underlyingBefore
      expect(assetsPaid).toBeGreaterThan(0n)
      const [request] = await midnight.ethereumErc20Vault.vaultRequestV1.repository.search({
        criteria: [{ type: 'exact-text', field: 'parent', text: redeem.redeem.name }],
      })
      expect(request).toMatchObject({
        action: 'redeem',
        state: 'Attested',
        signerAccount: vaultAccount,
        attestationOutputKind: 'executed',
      })
      expect(littleEndian(request?.attestationOutput ?? '')).toBe(assetsPaid)
      const activity = await midnight.ethereumErc20Vault.activityV1.repository.get(
        redeem.redeem.name,
      )
      expect(activity).toMatchObject({
        type: 'Redeem',
        state: 'Complete',
        outcome: 'redeemed',
        amount: shares,
        erc20Address: stataErc20Address,
        destination: underlyingErc20Address,
      })

      // Both caller calls were finalised by the user's wallet.
      const transactions = await midnight.transactionV1.repository.search({
        criteria: [{ type: 'exact-text', field: 'parent', text: redeem.redeem.name }],
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
        { circuit: 'startRedeem', signer: 'caller', state: 'Succeeded', unprovenTx: null },
        { circuit: 'completeRedeem', signer: 'caller', state: 'Succeeded', unprovenTx: null },
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

  /** Mirrors `vaultTokenType` in `vault-token-infos.ts`, which the boundary rule keeps out of a test. */
  function sharesCoinType(stataErc20Address: string): string {
    return rawTokenType(
      pureCircuits.vaultTokenDomainSeparator(evmAddressBytes(stataErc20Address)),
      backend.config.client.midnightEthereumErc20Vault.contractAddress,
    )
  }
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

/** The attested `uint256` as the MPC serialises it: 32 little-endian bytes in hex. */
function littleEndian(hex: string): bigint {
  const bytes = hex.match(/../g) ?? []
  return toBigInt(`0x${bytes.reverse().join('')}`)
}
