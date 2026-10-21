import { rawTokenType } from '@midnight-ntwrk/compact-runtime'
import {
  deriveVaultEvmAddress,
  evmAddressBytes,
  pureCircuits,
} from '@sig-net/midnight-examples-erc20-vault-contract'
import { Interface, JsonRpcProvider, toBigInt } from 'ethers'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { SupplyTarget } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import type { Backend } from '@/server/backend'

import { ensureAaveReserveAcceptsDeposits } from './aave-reserve'
import { testBackend } from './backend'
import { deleteOperation, driveOperation, log } from './operation-round-trip'
import { completeApprovalAsUser, startApprovalAsUser } from './user-approval'
import { completeDepositAsUser, startDepositAsUser } from './user-deposit'
import { completeSupplyAsUser, startSupplyAsUser } from './user-supply'
import { startUserWallet, type UserWallet, userWalletSeed } from './user-wallet'

const ROUND_TRIP_TIMEOUT_MS = 60 * 60_000
/** Whole underlying deposited and then supplied to the wrapper. */
const AMOUNT = 1_500_000n

/**
 * One supply from `startSupply` to `Completed` over the whole local stack: the caller first
 * deposits the stata underlying it will supply, the wrapper's allowance is granted when the
 * vault account lacks it, and the supply then deposits that underlying into Aave's static
 * wrapper from the vault account. This test plays the browser, which builds, proves and
 * finalises both caller calls of the deposit and the supply with the user wallet paying their
 * fees, and the wallet's own coin of the underlying funding the supply's start call. The vault
 * account's balances on the fork before and after prove the deposit the MPC signed executed, and
 * the attested output is the shares it minted.
 */
describe('ERC20 vault supply round trip over the local stack', () => {
  let backend: Backend
  let user: UserWallet
  let evm: JsonRpcProvider
  const callerSecret = userWalletSeed()
  const created: [string, string][] = []
  let target: SupplyTarget
  let coinType: string
  let deposited = false

  beforeAll(async () => {
    backend = await testBackend()
    await backend.start()
    evm = new JsonRpcProvider(backend.config.client.ethereum.rpcURL, undefined, {
      cacheTimeout: -1,
    })
    user = await startUserWallet(userWalletSeed(), backend.config.client.midnightNetwork)
    const targeted = await backend.midnight.ethereumErc20Vault.supplyV1.adaptor.getSupplyTarget(
      callerSecret,
      {},
    )
    if (!targeted.ok) throw new Error(targeted.error)
    target = targeted.target
    await ensureAaveReserveAcceptsDeposits(evm, target.stataErc20Address)
    // Mirrors `vaultTokenType` in `vault-token-infos.ts`, which the boundary rule keeps out of a test.
    coinType = rawTokenType(
      pureCircuits.vaultTokenDomainSeparator(evmAddressBytes(target.underlyingErc20Address)),
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
    'the wrapper is approved and a deposit gives the caller the underlying coin it will supply',
    async () => {
      const { ethereum } = backend
      const { approvalV1, depositV1 } = backend.midnight.ethereumErc20Vault
      const { underlyingErc20Address } = target
      if (target.allowance === 0n) {
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
      const faucet = ethereum.localFaucetV1.service
      if (faucet === null) throw new Error('the supply test needs the local stack and its faucet')
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
      expect(await user.shieldedBalance(coinType)).toBeGreaterThanOrEqual(AMOUNT)
      deposited = true
    },
    ROUND_TRIP_TIMEOUT_MS,
  )

  test(
    'the underlying in the vault is supplied to the Aave wrapper',
    async () => {
      if (!deposited) throw new Error('the deposit did not run')
      const { midnight } = backend
      const { supplyV1 } = midnight.ethereumErc20Vault
      const { midnightSignet, midnightEthereumErc20Vault } = backend.config.client
      const vaultAccount = deriveVaultEvmAddress(
        midnightSignet.mpcRootPublicKey,
        midnightEthereumErc20Vault.contractAddress,
      ).toLowerCase()
      const { underlyingErc20Address, stataErc20Address } = target

      const underlyingBefore = await balanceOf(evm, underlyingErc20Address, vaultAccount)
      const sharesBefore = await balanceOf(evm, stataErc20Address, vaultAccount)
      const coinsBefore = await user.shieldedBalance(coinType)
      log(`supplying ${AMOUNT.toString()} base units of ${underlyingErc20Address} to the wrapper`)
      const supply = await startSupplyAsUser(backend, callerSecret, user, { amount: AMOUNT })
      if (!supply.ok) throw new Error(supply.error)
      created.push(['midnight_ethereum_erc20_vault_supplies_v1', supply.supply.name])
      expect(supply.supply).toMatchObject({
        underlyingErc20Address,
        stataErc20Address,
        amount: AMOUNT,
        state: 'AwaitingStartTransaction',
        vaultAccount,
      })
      const [start] = await midnight.transactionV1.repository.search({
        criteria: [{ type: 'exact-text', field: 'parent', text: supply.supply.name }],
      })
      expect(start).toMatchObject({ circuit: 'startSupply', signer: 'caller', unprovenTx: null })
      expect(start?.finalizedTx).toMatch(/^[0-9a-f]+$/)

      await driveOperation(
        {
          name: supply.supply.name,
          state: async () => (await supplyV1.repository.get(supply.supply.name))?.state,
          complete: () => completeSupplyAsUser(backend, callerSecret, user, supply.supply.name),
        },
        ROUND_TRIP_TIMEOUT_MS,
      )

      expect((await supplyV1.repository.get(supply.supply.name))?.outcome).toBe('supplied')
      expect(underlyingBefore - (await balanceOf(evm, underlyingErc20Address, vaultAccount))).toBe(
        AMOUNT,
      )
      const sharesMinted = (await balanceOf(evm, stataErc20Address, vaultAccount)) - sharesBefore
      expect(sharesMinted).toBeGreaterThan(0n)
      expect(coinsBefore - (await user.shieldedBalance(coinType))).toBe(AMOUNT)
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

      // Both caller calls were finalised by the user's wallet.
      const transactions = await midnight.transactionV1.repository.search({
        criteria: [{ type: 'exact-text', field: 'parent', text: supply.supply.name }],
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
        { circuit: 'startSupply', signer: 'caller', state: 'Succeeded', unprovenTx: null },
        { circuit: 'completeSupply', signer: 'caller', state: 'Succeeded', unprovenTx: null },
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

/** The attested `uint256` as the MPC serialises it: 32 little-endian bytes in hex. */
function littleEndian(hex: string): bigint {
  const bytes = hex.match(/../g) ?? []
  return toBigInt(`0x${bytes.reverse().join('')}`)
}
