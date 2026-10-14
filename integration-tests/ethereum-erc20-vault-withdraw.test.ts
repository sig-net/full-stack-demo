import { randomBytes } from 'node:crypto'

import { bytesToHex } from '@sig-net/midnight'
import { deriveVaultEvmAddress } from '@sig-net/midnight-examples-erc20-vault-contract'
import { Interface, JsonRpcProvider, toBigInt } from 'ethers'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Backend } from '@/server/backend'

import { testBackend } from './backend'
import { CIRCLE_USDC } from './sepolia-tokens'
import { deleteOperation, driveOperation, log } from './operation-round-trip'
import { startUserWallet, type UserWallet, userWalletSeed } from './user-wallet'

const ROUND_TRIP_TIMEOUT_MS = 45 * 60_000
/** Whole USDC deposited and then sent back out. */
const AMOUNT = 1_500_000n

/**
 * One withdrawal from `startWithdraw` to `Completed` over the whole local stack: the caller
 * first deposits the USDC it will send, then sends it from the vault account to a fresh
 * destination on the fork. The destination's balance after proves the transfer the MPC signed
 * executed.
 */
describe('ERC20 vault withdraw round trip over the local stack', () => {
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
    'USDC in the vault is sent to a destination on Ethereum',
    async () => {
      const { midnight, ethereum } = backend
      const { depositV1, withdrawV1 } = midnight.ethereumErc20Vault
      const { midnightSignet, midnightEthereumErc20Vault } = backend.config.client
      const vaultAccount = deriveVaultEvmAddress(
        midnightSignet.mpcRootPublicKey,
        midnightEthereumErc20Vault.contractAddress,
      ).toLowerCase()
      const destination = `0x${bytesToHex(randomBytes(20))}`
      const wallet = user.publicKeys

      const deposit = await depositV1.adaptor.startDeposit(callerSecret, {
        depositRequest: { erc20Address: CIRCLE_USDC, amount: AMOUNT },
        wallet,
      })
      if (!deposit.ok) throw new Error(deposit.error)
      created.push(['midnight_ethereum_erc20_vault_deposits_v1', deposit.deposit.name])
      const faucet = ethereum.localFaucetV1.service
      if (faucet === null) throw new Error('the withdraw test needs the local stack and its faucet')
      await faucet.fundAccount({ account: deposit.deposit.depositAccount })
      await faucet.fundErc20({
        account: deposit.deposit.depositAccount,
        erc20Address: CIRCLE_USDC.toLowerCase(),
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

      const vaultBefore = await balanceOf(evm, CIRCLE_USDC, vaultAccount)
      log(`sending ${AMOUNT.toString()} USDC base units to ${destination}`)
      const withdraw = await withdrawV1.adaptor.startWithdraw(callerSecret, {
        withdrawRequest: { erc20Address: CIRCLE_USDC, amount: AMOUNT, destEvmAddress: destination },
        wallet,
      })
      if (!withdraw.ok) throw new Error(withdraw.error)
      created.push(['midnight_ethereum_erc20_vault_withdraws_v1', withdraw.withdraw.name])
      await driveOperation(
        backend,
        callerSecret,
        user,
        {
          name: withdraw.withdraw.name,
          state: async () => (await withdrawV1.repository.get(withdraw.withdraw.name))?.state,
          complete: () =>
            withdrawV1.adaptor.completeWithdraw(callerSecret, {
              name: withdraw.withdraw.name,
              wallet,
            }),
        },
        ROUND_TRIP_TIMEOUT_MS,
      )

      expect((await withdrawV1.repository.get(withdraw.withdraw.name))?.outcome).toBe('sent')
      expect(await balanceOf(evm, CIRCLE_USDC, destination)).toBe(AMOUNT)
      expect(vaultBefore - (await balanceOf(evm, CIRCLE_USDC, vaultAccount))).toBe(AMOUNT)
      const [request] = await midnight.ethereumErc20Vault.vaultRequestV1.repository.search({
        criteria: [{ type: 'exact-text', field: 'parent', text: withdraw.withdraw.name }],
      })
      expect(request).toMatchObject({
        action: 'withdraw',
        state: 'Attested',
        signerAccount: vaultAccount,
        attestationOutputKind: 'executed',
        attestationOutput: '01',
      })
      const activity = await midnight.ethereumErc20Vault.activityV1.repository.get(
        withdraw.withdraw.name,
      )
      expect(activity).toMatchObject({
        type: 'Withdraw',
        state: 'Complete',
        outcome: 'sent',
        amount: AMOUNT,
        destination,
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
