import { deriveVaultEvmAddress } from '@sig-net/midnight-examples-erc20-vault-contract'
import { Interface, JsonRpcProvider, toBigInt } from 'ethers'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Backend } from '@/server/backend'

import { testBackend } from './backend'
import { deleteOperation, driveOperation, log } from './operation-round-trip'
import { startUserWallet, type UserWallet, userWalletSeed } from './user-wallet'

const ROUND_TRIP_TIMEOUT_MS = 60 * 60_000
/** Whole underlying deposited and supplied, whose shares are then redeemed. */
const AMOUNT = 1_500_000n

/**
 * One redeem from `startRedeem` to `Completed` over the whole local stack: the caller deposits
 * the stata underlying, supplies it to Aave's static wrapper (approving the wrapper first when
 * the vault account lacks the allowance), then redeems the shares that supply minted. The
 * vault account's balances on the fork before and after prove the redeem the MPC signed
 * executed, and the attested output is the underlying the wrapper paid out.
 */
describe('ERC20 vault redeem round trip over the local stack', () => {
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
    'shares of the Aave wrapper in the vault are redeemed for the underlying',
    async () => {
      const { midnight, ethereum } = backend
      const { approvalV1, depositV1, supplyV1, redeemV1 } = midnight.ethereumErc20Vault
      const { midnightSignet, midnightEthereumErc20Vault } = backend.config.client
      const vaultAccount = deriveVaultEvmAddress(
        midnightSignet.mpcRootPublicKey,
        midnightEthereumErc20Vault.contractAddress,
      ).toLowerCase()
      const wallet = user.publicKeys

      const targeted = await supplyV1.adaptor.getSupplyTarget(callerSecret, {})
      if (!targeted.ok) throw new Error(targeted.error)
      const { underlyingErc20Address, stataErc20Address } = targeted.target
      if (targeted.target.allowance === 0n) {
        log('the wrapper holds no allowance on the underlying: approving first')
        const approval = await approvalV1.adaptor.startApproval(callerSecret, {
          approvalRequest: { kind: 'stata' },
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
        depositRequest: { erc20Address: underlyingErc20Address, amount: AMOUNT },
        wallet,
      })
      if (!deposit.ok) throw new Error(deposit.error)
      created.push(['midnight_ethereum_erc20_vault_deposits_v1', deposit.deposit.name])
      const faucet = ethereum.localFaucetV1.service
      if (faucet === null) throw new Error('the redeem test needs the local stack and its faucet')
      await faucet.fundAccount({ account: deposit.deposit.depositAccount })
      await faucet.fundErc20({
        account: deposit.deposit.depositAccount,
        erc20Address: underlyingErc20Address,
        amount: AMOUNT,
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

      const sharesBeforeSupply = await balanceOf(evm, stataErc20Address, vaultAccount)
      const supply = await supplyV1.adaptor.startSupply(callerSecret, {
        supplyRequest: { amount: AMOUNT },
        wallet,
      })
      if (!supply.ok) throw new Error(supply.error)
      created.push(['midnight_ethereum_erc20_vault_supplies_v1', supply.supply.name])
      await driveOperation(
        backend,
        callerSecret,
        user,
        {
          name: supply.supply.name,
          state: async () => (await supplyV1.repository.get(supply.supply.name))?.state,
          complete: () =>
            supplyV1.adaptor.completeSupply(callerSecret, { name: supply.supply.name, wallet }),
        },
        ROUND_TRIP_TIMEOUT_MS,
      )
      expect((await supplyV1.repository.get(supply.supply.name))?.outcome).toBe('supplied')
      const shares = (await balanceOf(evm, stataErc20Address, vaultAccount)) - sharesBeforeSupply
      expect(shares).toBeGreaterThan(0n)

      const underlyingBefore = await balanceOf(evm, underlyingErc20Address, vaultAccount)
      const sharesBefore = await balanceOf(evm, stataErc20Address, vaultAccount)
      log(`redeeming ${shares.toString()} shares of ${stataErc20Address} for the underlying`)
      const redeem = await redeemV1.adaptor.startRedeem(callerSecret, {
        redeemRequest: { shares },
        wallet,
      })
      if (!redeem.ok) throw new Error(redeem.error)
      created.push(['midnight_ethereum_erc20_vault_redeems_v1', redeem.redeem.name])
      expect(redeem.redeem).toMatchObject({
        stataErc20Address,
        underlyingErc20Address,
        vaultAccount,
      })
      await driveOperation(
        backend,
        callerSecret,
        user,
        {
          name: redeem.redeem.name,
          state: async () => (await redeemV1.repository.get(redeem.redeem.name))?.state,
          complete: () =>
            redeemV1.adaptor.completeRedeem(callerSecret, { name: redeem.redeem.name, wallet }),
        },
        ROUND_TRIP_TIMEOUT_MS,
      )

      expect((await redeemV1.repository.get(redeem.redeem.name))?.outcome).toBe('redeemed')
      expect(sharesBefore - (await balanceOf(evm, stataErc20Address, vaultAccount))).toBe(shares)
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

/** The attested `uint256` as the MPC serialises it: 32 little-endian bytes in hex. */
function littleEndian(hex: string): bigint {
  const bytes = hex.match(/../g) ?? []
  return toBigInt(`0x${bytes.reverse().join('')}`)
}
