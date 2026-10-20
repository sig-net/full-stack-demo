import { randomBytes } from 'node:crypto'

import {
  type Binding,
  nativeToken,
  type Proof,
  type SignatureEnabled,
  Transaction,
} from '@midnightntwrk/ledger-v9'
import { rawTokenType } from '@midnight-ntwrk/compact-runtime'
import { bytesToHex } from '@sig-net/midnight'
import {
  deriveVaultEvmAddress,
  evmAddressBytes,
  pureCircuits,
} from '@sig-net/midnight-examples-erc20-vault-contract'
import { Interface, JsonRpcProvider, toBigInt } from 'ethers'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Deposit } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import type { Withdraw } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'
import type { Backend } from '@/server/backend'

import { testBackend } from './backend'
import { CIRCLE_USDC } from './sepolia-tokens'
import { deleteOperation, driveOperation, log } from './operation-round-trip'
import { secretKeyOf } from './user-caller-call'
import { completeDepositAsUser, startDepositAsUser } from './user-deposit'
import { startUserWallet, type UserWallet, userWalletSeed } from './user-wallet'
import { completeWithdrawAsUser, startWithdrawAsUser } from './user-withdraw'

const ROUND_TRIP_TIMEOUT_MS = 45 * 60_000
/** Whole USDC deposited and then sent back out. */
const AMOUNT = 1_500_000n
const SWEEP_GAS = {
  gasLimit: 100_000n,
  maxFeePerGas: 30_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
}

/**
 * One withdrawal from `startWithdraw` to `Completed` over the whole local stack: the caller
 * first deposits the USDC it will send, then sends it from the vault account to a fresh
 * destination on the fork. This test plays the browser, which builds, proves and binds both
 * caller calls of each operation without a fee, with the wallet's own coin of the token funding
 * the start call, and the relayer pays each call's fee. The destination's balance after proves
 * the transfer the MPC signed executed. Between the two legs, bound bytes the relayer must not
 * pay for are offered to the server with the caller's real coins and refused.
 */
describe('ERC20 vault withdraw round trip over the local stack', () => {
  let backend: Backend
  let user: UserWallet
  let evm: JsonRpcProvider
  const callerSecret = userWalletSeed()
  const created: [string, string][] = []
  let deposit: Deposit | undefined
  let coinType: string

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
    'a deposit gives the caller the vault coin it will send',
    async () => {
      const { depositV1 } = backend.midnight.ethereumErc20Vault
      const started = await startDepositAsUser(backend, callerSecret, user, {
        erc20Address: CIRCLE_USDC,
        amount: AMOUNT,
      })
      if (!started.ok) throw new Error(started.error)
      deposit = started.deposit
      created.push(['midnight_ethereum_erc20_vault_deposits_v1', deposit.name])
      const faucet = backend.ethereum.localFaucetV1.service
      if (faucet === null) throw new Error('the withdraw test needs the local stack and its faucet')
      await faucet.fundAccount({ account: deposit.depositAccount })
      await faucet.fundErc20({
        account: deposit.depositAccount,
        erc20Address: CIRCLE_USDC.toLowerCase(),
        amount: AMOUNT,
      })
      const name = deposit.name
      await driveOperation(
        backend,
        callerSecret,
        user,
        {
          name,
          state: async () => (await depositV1.repository.get(name))?.state,
          complete: () => completeDepositAsUser(backend, callerSecret, user, name),
        },
        ROUND_TRIP_TIMEOUT_MS,
      )
      expect((await depositV1.repository.get(name))?.outcome).toBe('minted')
      expect(await user.shieldedBalance(coinType)).toBeGreaterThanOrEqual(AMOUNT)
    },
    ROUND_TRIP_TIMEOUT_MS,
  )

  test(
    'bound bytes the relayer must not pay for are refused and write nothing',
    async () => {
      if (deposit === undefined) throw new Error('the deposit did not run')
      const { depositV1, withdrawV1 } = backend.midnight.ethereumErc20Vault
      const withdrawRequest = {
        erc20Address: CIRCLE_USDC,
        amount: AMOUNT,
        destEvmAddress: `0x${bytesToHex(randomBytes(20))}`,
      }
      const before = await Promise.all([
        withdrawV1.adaptor.listWithdraws(callerSecret, {}),
        depositV1.adaptor.listDeposits(callerSecret, {}),
      ])
      const prepared = await withdrawV1.adaptor.prepareStartWithdraw(callerSecret, {
        withdrawRequest,
      })
      if (!prepared.ok) throw new Error(prepared.error)
      const unboundStart = await withdrawV1.callBuilder.buildStart({
        secretKey: secretKeyOf(callerSecret),
        wallet: user.publicKeys,
        inIndex: prepared.inputs.inIndex,
        ...withdrawRequest,
      })

      // The user's wallet pays the fee itself, so the bytes carry a DUST spend.
      const withFee = await user.balance(unboundStart)
      expect(
        await withdrawV1.adaptor.startWithdraw(callerSecret, {
          withdrawRequest,
          inIndex: prepared.inputs.inIndex,
          boundTx: withFee,
        }),
      ).toEqual({
        ok: false,
        error:
          'the bound bytes must be exactly one startWithdraw call to the vault, spending shielded coins alone',
      })
      await user.revert(withFee)

      // The call bound without a fee, with an unshielded NIGHT transfer merged beside it.
      const withoutFee = await user.balanceWithoutFee(unboundStart)
      const night = await user.selfTransfer('unshielded', nativeToken().raw, 1n)
      expect(
        await withdrawV1.adaptor.startWithdraw(callerSecret, {
          withdrawRequest,
          inIndex: prepared.inputs.inIndex,
          boundTx: merged(withoutFee, night),
        }),
      ).toEqual({
        ok: false,
        error:
          'the bound bytes must be exactly one startWithdraw call to the vault, spending shielded coins alone',
      })
      await user.revert(night)
      await user.revert(withoutFee)

      // A deposit start bound without a fee, with a shielded transfer of the vault coin merged beside it.
      const depositRequest = { erc20Address: CIRCLE_USDC, amount: 1_000_000n }
      const preparedDeposit = await depositV1.adaptor.prepareStartDeposit(callerSecret, {
        depositRequest,
        wallet: user.publicKeys,
      })
      if (!preparedDeposit.ok) throw new Error(preparedDeposit.error)
      const depositStart = await user.balanceWithoutFee(
        await depositV1.callBuilder.buildStart({
          secretKey: secretKeyOf(callerSecret),
          wallet: user.publicKeys,
          inIndex: preparedDeposit.inputs.inIndex,
          evmNonce: preparedDeposit.inputs.evmNonce,
          gas: SWEEP_GAS,
          erc20Address: depositRequest.erc20Address,
          amount: depositRequest.amount,
        }),
      )
      const coin = await user.selfTransfer('shielded', coinType, 1n)
      expect(
        await depositV1.adaptor.startDeposit(callerSecret, {
          depositRequest,
          wallet: user.publicKeys,
          inIndex: preparedDeposit.inputs.inIndex,
          evmNonce: preparedDeposit.inputs.evmNonce,
          boundTx: merged(depositStart, coin),
        }),
      ).toEqual({
        ok: false,
        error:
          'the bound bytes must be exactly one startDeposit call to the vault, spending no coins',
      })
      await user.revert(coin)
      await user.revert(depositStart)

      expect(
        await Promise.all([
          withdrawV1.adaptor.listWithdraws(callerSecret, {}),
          depositV1.adaptor.listDeposits(callerSecret, {}),
        ]),
      ).toEqual(before)
    },
    ROUND_TRIP_TIMEOUT_MS,
  )

  test(
    'USDC in the vault is sent to a destination on Ethereum',
    async () => {
      if (deposit === undefined) throw new Error('the deposit did not run')
      const { midnight } = backend
      const { withdrawV1 } = midnight.ethereumErc20Vault
      const { midnightSignet, midnightEthereumErc20Vault } = backend.config.client
      const vaultAccount = deriveVaultEvmAddress(
        midnightSignet.mpcRootPublicKey,
        midnightEthereumErc20Vault.contractAddress,
      ).toLowerCase()
      const destination = `0x${bytesToHex(randomBytes(20))}`
      const vaultBefore = await balanceOf(evm, CIRCLE_USDC, vaultAccount)
      const coinsBefore = await user.shieldedBalance(coinType)

      log(`sending ${AMOUNT.toString()} USDC base units to ${destination}`)
      const started = await startWithdrawAsUser(backend, callerSecret, user, {
        erc20Address: CIRCLE_USDC,
        amount: AMOUNT,
        destEvmAddress: destination,
      })
      if (!started.ok) throw new Error(started.error)
      const withdraw: Withdraw = started.withdraw
      created.push(['midnight_ethereum_erc20_vault_withdraws_v1', withdraw.name])
      expect(withdraw).toMatchObject({
        erc20Address: CIRCLE_USDC.toLowerCase(),
        amount: AMOUNT,
        destEvmAddress: destination,
        state: 'AwaitingStartTransaction',
        vaultAccount,
        outcome: null,
        failure: null,
        error: null,
      })
      const [start] = await midnight.transactionV1.repository.search({
        criteria: [{ type: 'exact-text', field: 'parent', text: withdraw.name }],
      })
      expect(start).toMatchObject({ circuit: 'startWithdraw', signer: 'caller', unprovenTx: null })
      expect(start?.boundTx).toMatch(/^[0-9a-f]+$/)

      await driveOperation(
        backend,
        callerSecret,
        user,
        {
          name: withdraw.name,
          state: async () => (await withdrawV1.repository.get(withdraw.name))?.state,
          complete: () => completeWithdrawAsUser(backend, callerSecret, user, withdraw.name),
        },
        ROUND_TRIP_TIMEOUT_MS,
      )

      expect((await withdrawV1.repository.get(withdraw.name))?.outcome).toBe('sent')
      expect(await balanceOf(evm, CIRCLE_USDC, destination)).toBe(AMOUNT)
      expect(vaultBefore - (await balanceOf(evm, CIRCLE_USDC, vaultAccount))).toBe(AMOUNT)
      expect(coinsBefore - (await user.shieldedBalance(coinType))).toBe(AMOUNT)
      const [request] = await midnight.ethereumErc20Vault.vaultRequestV1.repository.search({
        criteria: [{ type: 'exact-text', field: 'parent', text: withdraw.name }],
      })
      expect(request).toMatchObject({
        action: 'withdraw',
        state: 'Attested',
        signerAccount: vaultAccount,
        attestationOutputKind: 'executed',
        attestationOutput: '01',
      })
      const activity = await midnight.ethereumErc20Vault.activityV1.repository.get(withdraw.name)
      expect(activity).toMatchObject({
        type: 'Withdraw',
        state: 'Complete',
        outcome: 'sent',
        amount: AMOUNT,
        destination,
      })

      // Both caller calls were bound by the user and paid by the relayer, never signed from a sign turn.
      const transactions = await midnight.transactionV1.repository.search({
        criteria: [{ type: 'exact-text', field: 'parent', text: withdraw.name }],
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
        { circuit: 'startWithdraw', signer: 'caller', state: 'Succeeded', unprovenTx: null },
        { circuit: 'completeWithdraw', signer: 'caller', state: 'Succeeded', unprovenTx: null },
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

/** One bound transaction holding both: a contract call and a transfer merge, two contract calls do not. */
function merged(boundA: string, boundB: string): string {
  return bytesToHex(boundTransactionOf(boundA).merge(boundTransactionOf(boundB)).serialize())
}

function boundTransactionOf(boundTx: string): Transaction<SignatureEnabled, Proof, Binding> {
  return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
    'signature',
    'proof',
    'binding',
    Uint8Array.from(Buffer.from(boundTx, 'hex')),
  )
}

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
