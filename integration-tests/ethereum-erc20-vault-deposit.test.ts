import { randomBytes } from 'node:crypto'

import { CIRCLE_USDC } from '@sig-net/midnight-examples-erc20-vault-contract'
import { AbiCoder, Interface, JsonRpcProvider, keccak256, toBeHex, toBigInt } from 'ethers'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { z } from 'zod'

import type { EthereumTransaction } from '@/lib/ethereum/transaction-v1/transaction'
import type { Deposit } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import type { Backend } from '@/server/backend'

import { testBackend } from './backend'
import { startUserWallet, type UserWallet, userWalletSeed } from './user-wallet'

const ROUND_TRIP_TIMEOUT_MS = 40 * 60_000
const POLL_EVERY_MS = 5_000

/**
 * One deposit from `startDeposit` to `Completed` over the whole local stack: the backend proves,
 * flushes, sends, polls the MPC, broadcasts on the fork, queues and flushes the attestation on
 * its own, and this test plays the user's wallet and funds the deposit account on the fork.
 */
describe('ERC20 vault deposit round trip over the local stack', () => {
  let backend: Backend
  let user: UserWallet
  let evm: JsonRpcProvider
  const callerSecret = randomBytes(32).toString('hex')
  let caller: string | undefined

  beforeAll(async () => {
    backend = await testBackend()
    await backend.start()
    evm = new JsonRpcProvider(backend.config.client.ethereum.rpcURL, undefined, {
      cacheTimeout: -1,
    })
    const syncing = Date.now()
    user = await startUserWallet(userWalletSeed(), backend.config.client.midnightNetwork)
    log(`user wallet synced in ${String(Date.now() - syncing)} ms`)
  }, ROUND_TRIP_TIMEOUT_MS)

  afterAll(async () => {
    const { pool } = backend.db
    if (caller !== undefined) {
      for (const table of [
        'midnight_transactions_v1',
        'ethereum_transactions_v1',
        'midnight_ethereum_erc20_vault_requests_v1',
        'midnight_ethereum_erc20_vault_deposits_v1',
      ]) {
        await pool.query(`delete from ${table} where name like $1`, [`${caller}/%`])
      }
      await pool.query('delete from event_outbox_entries_v1 where data::text like $1', [
        `%${caller}%`,
      ])
    }
    await user.stop()
    await backend.stop()
    await pool.end()
  }, ROUND_TRIP_TIMEOUT_MS)

  test(
    'deposit from start to Completed',
    async () => {
      const { adaptor } = backend.midnight.ethereumErc20Vault.depositV1
      const transactions = backend.midnight.transactionV1.adaptor
      const wallet = user.publicKeys
      const startedAt = Date.now()

      const started = await adaptor.startDeposit(callerSecret, {
        depositRequest: { erc20Address: CIRCLE_USDC, amount: 1_000_000n },
        wallet,
      })
      expect(started.ok).toBe(true)
      if (!started.ok) return
      const deposit = started.deposit
      caller = deposit.name.split('/').slice(0, 2).join('/')
      log(`started ${deposit.name} in ${String(Date.now() - startedAt)} ms`)

      await fundDepositAccount(evm, deposit.depositAccount, deposit.amount)
      log(`funded ${deposit.depositAccount} with one ETH and ${deposit.amount.toString()} USDC`)

      const submitted = new Set<string>()
      const trail = new Trail(backend, deposit.name)
      const playWallet = async (): Promise<void> => {
        const live = await transactions.listTransactions(callerSecret, { parent: deposit.name })
        if (!live.ok) throw new Error(live.error)
        for (const transaction of live.transactions) {
          if (
            transaction.state !== 'AwaitingWallet' ||
            transaction.signer !== 'caller' ||
            transaction.unboundTx === null ||
            submitted.has(transaction.name)
          ) {
            continue
          }
          submitted.add(transaction.name)
          const balancing = Date.now()
          const finalizedTx = await user.balance(transaction.unboundTx)
          const result = await transactions.submitTransaction(callerSecret, {
            name: transaction.name,
            finalizedTx,
          })
          if (!result.ok) throw new Error(result.error)
          log(
            `balanced and submitted ${transaction.circuit} ${transaction.name} in ${String(Date.now() - balancing)} ms`,
          )
        }
      }
      const depositState = async (): Promise<Deposit['state']> => {
        await trail.observe()
        const current = await backend.midnight.ethereumErc20Vault.depositV1.repository.get(
          deposit.name,
        )
        if (current === undefined) throw new Error(`${deposit.name} disappeared`)
        return current.state
      }

      await waitFor(async () => {
        await playWallet()
        return (await depositState()) === 'AwaitingCompletion'
      })
      log(`AwaitingCompletion reached ${String(Date.now() - startedAt)} ms after the start`)

      const completing = await adaptor.completeDeposit(callerSecret, { name: deposit.name, wallet })
      expect(completing.ok).toBe(true)
      if (!completing.ok) return
      await waitFor(async () => {
        await playWallet()
        return (await depositState()) === 'Completed'
      })
      log(`Completed ${String(Date.now() - startedAt)} ms after the start`)

      const final = await backend.midnight.ethereumErc20Vault.depositV1.repository.get(deposit.name)
      expect(final?.outcome).toBe('minted')

      const [request] = await backend.midnight.ethereumErc20Vault.vaultRequestV1.repository.search({
        criteria: [{ type: 'exact-text', field: 'parent', text: deposit.name }],
      })
      if (request === undefined) throw new Error('no vault request')
      expect(request.state).toBe('Attested')
      expect(request.attestationOutputKind).toBe('executed')
      const ledger = await backend.midnight.ethereumErc20Vault.ledger.state()
      expect(ledger.depositArgsMap.member(request.inIndex)).toBe(false)

      const [sweep] = await backend.ethereum.transactionV1.repository.search({
        criteria: [{ type: 'exact-text', field: 'parent', text: request.name }],
        order: { field: 'createTime', direction: 'desc' },
        limit: 1,
      })
      expect(sweep?.state).toBe('Succeeded')

      expect(await eventTrail(backend, deposit.name)).toEqual([
        ['deposit', 'awaiting-start-transaction'],
        ['start', 'awaiting-proof'],
        ['start', 'awaiting-wallet'],
        ['start', 'awaiting-submission'],
        ['start', 'awaiting-inclusion'],
        ['start', 'succeeded'],
        ['deposit', 'awaiting-vault-request'],
        ['request', 'awaiting-flush'],
        ['request', 'awaiting-send'],
        ['request', 'awaiting-signature'],
        ['request', 'awaiting-broadcast'],
        ['request', 'awaiting-attestation'],
        ['request', 'awaiting-attestation-queue'],
        ['request', 'awaiting-attestation-flush'],
        ['request', 'attested'],
        ['deposit', 'awaiting-completion'],
        ['deposit', 'awaiting-complete-transaction'],
        ['complete', 'awaiting-proof'],
        ['complete', 'awaiting-wallet'],
        ['complete', 'awaiting-submission'],
        ['complete', 'awaiting-inclusion'],
        ['complete', 'succeeded'],
        ['deposit', 'completed'],
      ])
    },
    ROUND_TRIP_TIMEOUT_MS,
  )
})

/** Logs every change of the deposit, its request and the newest child under each, so a stall shows where it stalled. */
class Trail {
  private readonly backend: Backend
  private readonly depositName: string
  private readonly seen = new Map<string, string>()

  constructor(backend: Backend, depositName: string) {
    this.backend = backend
    this.depositName = depositName
  }

  async observe(): Promise<void> {
    const { midnight, ethereum } = this.backend
    const deposit = await midnight.ethereumErc20Vault.depositV1.repository.get(this.depositName)
    this.note('deposit', deposit?.state)
    for (const transaction of await midnight.transactionV1.repository.search({
      criteria: [{ type: 'exact-text', field: 'parent', text: this.depositName }],
    })) {
      this.note(`${transaction.circuit} ${shortName(transaction.name)}`, stateOf(transaction))
    }
    const [request] = await midnight.ethereumErc20Vault.vaultRequestV1.repository.search({
      criteria: [{ type: 'exact-text', field: 'parent', text: this.depositName }],
    })
    if (request === undefined) return
    this.note('vault request', stateOf(request))
    for (const transaction of await midnight.transactionV1.repository.search({
      criteria: [{ type: 'exact-text', field: 'parent', text: request.name }],
    })) {
      this.note(`${transaction.circuit} ${shortName(transaction.name)}`, stateOf(transaction))
    }
    for (const transaction of await ethereum.transactionV1.repository.search({
      criteria: [{ type: 'exact-text', field: 'parent', text: request.name }],
    })) {
      this.note(`sweep ${shortName(transaction.name)}`, stateOf(transaction))
    }
  }

  private note(subject: string, state: string | undefined): void {
    if (state === undefined || this.seen.get(subject) === state) return
    this.seen.set(subject, state)
    log(`${subject}: ${state}`)
  }
}

/** The outbox events the deposit and its children published, as `[actor, state]` in publication order. */
async function eventTrail(backend: Backend, depositName: string): Promise<[Actor, string][]> {
  const { midnight } = backend
  const [request] = await midnight.ethereumErc20Vault.vaultRequestV1.repository.search({
    criteria: [{ type: 'exact-text', field: 'parent', text: depositName }],
  })
  const transactions = await midnight.transactionV1.repository.search({
    criteria: [{ type: 'exact-text', field: 'parent', text: depositName }],
  })
  const actorByKey = new Map<string, Actor>([[depositName, 'deposit']])
  if (request !== undefined) actorByKey.set(request.name, 'request')
  for (const transaction of transactions) {
    actorByKey.set(transaction.name, transaction.circuit === 'startDeposit' ? 'start' : 'complete')
  }
  const entries = await backend.event.outboxEntryV1.repository.search({
    criteria: [],
    order: { field: 'createdAt', direction: 'asc' },
  })
  const trail: { actor: Actor; state: string; createdAt: Date }[] = []
  for (const entry of entries) {
    const event = outboxEventSchema.parse(JSON.parse(new TextDecoder().decode(entry.data)))
    const actor = actorByKey.get(event.key)
    if (actor === undefined) continue
    trail.push({
      actor,
      state: event.type.slice(event.type.lastIndexOf('.') + 1),
      createdAt: entry.createdAt,
    })
  }
  // A parent publishes its own event before it commits the child, inside one unit of work, so a
  // tie on the millisecond is broken parent first.
  return trail
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        ACTOR_RANK.indexOf(a.actor) - ACTOR_RANK.indexOf(b.actor),
    )
    .map(({ actor, state }) => [actor, state])
}

type Actor = 'deposit' | 'request' | 'start' | 'complete'

const ACTOR_RANK: readonly Actor[] = ['deposit', 'request', 'start', 'complete']

const outboxEventSchema = z.object({ key: z.string(), type: z.string() })

function stateOf(resource: MidnightTransaction | EthereumTransaction | VaultRequest): string {
  if ('failure' in resource && resource.failure !== null) {
    return `${resource.state} (${resource.failure}${resource.error === null ? '' : `: ${resource.error}`})`
  }
  return resource.state
}

function shortName(name: string): string {
  return name.slice(-8)
}

function log(message: string): void {
  console.log(`${new Date().toISOString()} ${message}`)
}

async function waitFor(condition: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + ROUND_TRIP_TIMEOUT_MS
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('waitFor timed out')
    await new Promise((resolve) => setTimeout(resolve, POLL_EVERY_MS))
  }
}

const ONE_ETH = toBeHex(10n ** 18n)
const ERC20 = new Interface(['function balanceOf(address) view returns (uint256)'])

/** anvil's `setBalance` for the gas and a write of the USDC balance slot for the token, read back to be sure. */
async function fundDepositAccount(
  provider: JsonRpcProvider,
  account: string,
  amount: bigint,
): Promise<void> {
  await provider.send('anvil_setBalance', [account, ONE_ETH])
  const location = await findBalanceLocation(provider, CIRCLE_USDC, account)
  await provider.send('anvil_setStorageAt', [CIRCLE_USDC, location, toBeHex(amount, 32)])
  const observed = await readBalance(provider, CIRCLE_USDC, account)
  if (observed !== amount) {
    throw new Error(`funded ${amount.toString()} USDC but balanceOf reads ${observed.toString()}`)
  }
}

async function readBalance(
  provider: JsonRpcProvider,
  token: string,
  holder: string,
): Promise<bigint> {
  return toBigInt(
    await provider.call({ to: token, data: ERC20.encodeFunctionData('balanceOf', [holder]) }),
  )
}

/**
 * The holder's slot in the token's balance mapping, found by writing a sentinel at the location
 * each candidate mapping slot implies (Solidity and Vyper layouts) and reading `balanceOf` back,
 * restoring the word either way.
 */
async function findBalanceLocation(
  provider: JsonRpcProvider,
  token: string,
  holder: string,
): Promise<string> {
  const abi = AbiCoder.defaultAbiCoder()
  const current = await readBalance(provider, token, holder)
  const sentinel = current === 1_337_733_113_377_331n ? current + 1n : 1_337_733_113_377_331n
  const sentinelWord = toBeHex(sentinel, 32)
  for (let slot = 0; slot < 64; slot++) {
    const candidates = [
      keccak256(abi.encode(['address', 'uint256'], [holder, slot])),
      keccak256(abi.encode(['uint256', 'address'], [slot, holder])),
    ]
    for (const location of candidates) {
      const original = await provider.getStorage(token, location)
      await provider.send('anvil_setStorageAt', [token, location, sentinelWord])
      const observed = await readBalance(provider, token, holder)
      await provider.send('anvil_setStorageAt', [token, location, original])
      if (observed === sentinel) return location
    }
  }
  throw new Error(`no balance mapping slot of ${token} found in slots 0..63`)
}
