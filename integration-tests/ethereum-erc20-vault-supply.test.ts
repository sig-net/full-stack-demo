import { deriveVaultEvmAddress } from '@sig-net/midnight-examples-erc20-vault-contract'
import { Interface, JsonRpcProvider, toBigInt } from 'ethers'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Backend } from '@/server/backend'

import { testBackend } from './backend'
import { deleteOperation, driveOperation, log } from './operation-round-trip'
import { completeDepositAsUser, startDepositAsUser } from './user-deposit'
import { startUserWallet, type UserWallet, userWalletSeed } from './user-wallet'

const ROUND_TRIP_TIMEOUT_MS = 60 * 60_000
/** Whole underlying deposited and then supplied to the wrapper. */
const AMOUNT = 1_500_000n

/**
 * One supply from `startSupply` to `Completed` over the whole local stack: the caller first
 * deposits the stata underlying it will supply, the wrapper's allowance is granted when the
 * vault account lacks it, and the supply then deposits that underlying into Aave's static
 * wrapper from the vault account. The vault account's balances on the fork before and after
 * prove the deposit the MPC signed executed, and the attested output is the shares it minted.
 */
describe('ERC20 vault supply round trip over the local stack', () => {
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
    'the underlying in the vault is supplied to the Aave wrapper',
    async () => {
      const { midnight, ethereum } = backend
      const { approvalV1, depositV1, supplyV1 } = midnight.ethereumErc20Vault
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

      const deposit = await startDepositAsUser(backend, callerSecret, user, {
        erc20Address: underlyingErc20Address,
        amount: AMOUNT,
      })
      if (!deposit.ok) throw new Error(deposit.error)
      created.push(['midnight_ethereum_erc20_vault_deposits_v1', deposit.deposit.name])
      const faucet = ethereum.localFaucetV1.service
      if (faucet === null) throw new Error('the supply test needs the local stack and its faucet')
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
          complete: () => completeDepositAsUser(backend, callerSecret, user, deposit.deposit.name),
        },
        ROUND_TRIP_TIMEOUT_MS,
      )
      expect((await depositV1.repository.get(deposit.deposit.name))?.outcome).toBe('minted')

      const underlyingBefore = await balanceOf(evm, underlyingErc20Address, vaultAccount)
      const sharesBefore = await balanceOf(evm, stataErc20Address, vaultAccount)
      log(`supplying ${AMOUNT.toString()} base units of ${underlyingErc20Address} to the wrapper`)
      const supply = await supplyV1.adaptor.startSupply(callerSecret, {
        supplyRequest: { amount: AMOUNT },
        wallet,
      })
      if (!supply.ok) throw new Error(supply.error)
      created.push(['midnight_ethereum_erc20_vault_supplies_v1', supply.supply.name])
      expect(supply.supply).toMatchObject({
        underlyingErc20Address,
        stataErc20Address,
        vaultAccount,
      })
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
      expect(underlyingBefore - (await balanceOf(evm, underlyingErc20Address, vaultAccount))).toBe(
        AMOUNT,
      )
      const sharesMinted = (await balanceOf(evm, stataErc20Address, vaultAccount)) - sharesBefore
      expect(sharesMinted).toBeGreaterThan(0n)
      const [request] = await midnight.ethereumErc20Vault.vaultRequestV1.repository.search({
        criteria: [{ type: 'exact-text', field: 'parent', text: supply.supply.name }],
      })
      expect(request).toMatchObject({
        action: 'supply',
        state: 'Attested',
        signerAccount: vaultAccount,
        attestationOutputKind: 'executed',
      })
      expect(littleEndian(request?.attestationOutput ?? '')).toBe(sharesMinted)
      const activity = await midnight.ethereumErc20Vault.activityV1.repository.get(
        supply.supply.name,
      )
      expect(activity).toMatchObject({
        type: 'Supply',
        state: 'Complete',
        outcome: 'supplied',
        amount: AMOUNT,
        erc20Address: underlyingErc20Address,
        destination: stataErc20Address,
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
