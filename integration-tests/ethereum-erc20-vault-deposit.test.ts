import { randomBytes } from 'node:crypto'

import { Interface, JsonRpcProvider, toBigInt } from 'ethers'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { z } from 'zod'

import type { EthereumTransaction } from '@/lib/ethereum/transaction-v1/transaction'
import type { Deposit } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import type { Backend } from '@/server/backend'

import { testBackend } from './backend'
import { CIRCLE_USDC } from './sepolia-tokens'
import { completeDepositAsUser, startDepositAsUser } from './user-deposit'
import { startUserWallet, type UserWallet, userWalletSeed } from './user-wallet'

const ROUND_TRIP_TIMEOUT_MS = 40 * 60_000
const POLL_EVERY_MS = 5_000
/** How many times the completion is built and committed again after an attempt ended failed. */
const COMPLETE_RETRIES = 3
/** Past one sweep interval, so the resolver's ledger check runs before a retry builds a second complete. */
const RETRY_AFTER_MS = 40_000

/**
 * One deposit from `startDeposit` to `Completed` over the whole local stack: this test plays the
 * browser, which builds, proves and binds the two caller calls without a fee, and funds the
 * deposit account on the fork, and the backend pays each call's fee from the relayer wallet,
 * submits, flushes, sends, polls the MPC, broadcasts on the fork, queues and flushes the
 * attestation on its own.
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
      await pool.query(
        "delete from event_outbox_entries_v1 where convert_from(data, 'UTF8') like $1",
        [`%${caller}%`],
      )
    }
    await user.stop()
    await backend.stop()
    await pool.end()
  }, ROUND_TRIP_TIMEOUT_MS)

  test(
    'deposit from start to Completed',
    async () => {
      const startedAt = Date.now()

      const started = await startDepositAsUser(backend, callerSecret, user, {
        erc20Address: CIRCLE_USDC,
        amount: 1_000_000n,
      })
      expect(started.ok).toBe(true)
      if (!started.ok) return
      const deposit = started.deposit
      caller = deposit.name.split('/').slice(0, 2).join('/')
      log(`started ${deposit.name} in ${String(Date.now() - startedAt)} ms`)

      await fundDepositAccount(backend, evm, deposit.depositAccount, deposit.amount)
      log(`funded ${deposit.depositAccount} with one ETH and ${deposit.amount.toString()} USDC`)

      const trail = new Trail(backend, deposit.name)
      const depositState = async (): Promise<Deposit['state']> => {
        await trail.observe()
        const current = await backend.midnight.ethereumErc20Vault.depositV1.repository.get(
          deposit.name,
        )
        if (current === undefined) throw new Error(`${deposit.name} disappeared`)
        return current.state
      }

      await waitFor(async () => (await depositState()) === 'AwaitingCompletion')
      log(`AwaitingCompletion reached ${String(Date.now() - startedAt)} ms after the start`)

      const completing = await completeDepositAsUser(backend, callerSecret, user, deposit.name)
      expect(completing.ok).toBe(true)
      if (!completing.ok) return
      // A failed attempt returns the deposit to AwaitingCompletion. The deposit resolver reads the
      // vault ledger before it believes the failure, so a complete that landed under a lost
      // acknowledgement is recorded by the next sweep and a retry only runs when the request is
      // still open.
      const failedAttempts = new Map<string, number>()
      let retries = 0
      await waitFor(async () => {
        const state = await depositState()
        if (state === 'Completed') return true
        if (state !== 'AwaitingCompletion') return false
        const attempt = await latestFailedComplete(backend, deposit.name)
        if (attempt === undefined) return false
        const seenAt = failedAttempts.get(attempt.name)
        if (seenAt === undefined) {
          failedAttempts.set(attempt.name, Date.now())
          log(`complete attempt ${shortName(attempt.name)} ended ${stateOf(attempt)}`)
          return false
        }
        if (seenAt === 0 || Date.now() - seenAt < RETRY_AFTER_MS) return false
        failedAttempts.set(attempt.name, 0)
        if (retries >= COMPLETE_RETRIES) {
          log(`no retry: ${String(COMPLETE_RETRIES)} retries were used, waiting on the sweep`)
          return false
        }
        retries += 1
        const retried = await completeDepositAsUser(backend, callerSecret, user, deposit.name)
        log(
          `completeDeposit retry ${String(retries)} ${retried.ok ? 'accepted' : `refused: ${retried.error}`}`,
        )
        return false
      })
      log(`Completed ${String(Date.now() - startedAt)} ms after the start`)

      const final = await backend.midnight.ethereumErc20Vault.depositV1.repository.get(deposit.name)
      expect(final?.outcome).toBe('minted')
      const activity = await backend.midnight.ethereumErc20Vault.activityV1.repository.get(
        deposit.name,
      )
      expect(activity).toMatchObject({
        type: 'Deposit',
        state: 'Complete',
        outcome: 'minted',
        startTransaction: { hash: expect.stringMatching(/^[0-9a-f]+$/), state: 'Succeeded' },
        foreignChainTransaction: {
          hash: expect.stringMatching(/^0x[0-9a-f]{64}$/),
          state: 'Succeeded',
        },
        completeTransaction: { hash: expect.stringMatching(/^[0-9a-f]+$/), state: 'Succeeded' },
      })

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

      const events = await eventTrail(backend, deposit.name)
      const expectedTrail: [Actor, string][] = [
        ['deposit', 'awaiting-start-transaction'],
        ['start', 'awaiting-fee'],
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
        ['complete', 'awaiting-fee'],
        ['complete', 'awaiting-submission'],
        ['complete', 'awaiting-inclusion'],
        ['complete', 'succeeded'],
        ['deposit', 'completed'],
      ]
      if (failedAttempts.size === 0) {
        expect(events).toEqual(expectedTrail)
      } else {
        log(
          `trail with ${String(failedAttempts.size)} failed complete attempt(s): ${JSON.stringify(events)}`,
        )
        const firstCompletion = expectedTrail.findIndex(
          ([actor, state]) => actor === 'deposit' && state === 'awaiting-completion',
        )
        expect(events.slice(0, firstCompletion + 1)).toEqual(
          expectedTrail.slice(0, firstCompletion + 1),
        )
        expect(events.at(-1)).toEqual(['deposit', 'completed'])
      }
    },
    ROUND_TRIP_TIMEOUT_MS,
  )
})

/** The newest `completeDeposit` transaction under the deposit when it ended failed. */
async function latestFailedComplete(
  backend: Backend,
  depositName: string,
): Promise<MidnightTransaction | undefined> {
  const [latest] = await backend.midnight.transactionV1.repository.search({
    criteria: [
      { type: 'exact-text', field: 'parent', text: depositName },
      { type: 'exact-text', field: 'circuit', text: 'completeDeposit' },
    ],
    order: { field: 'createTime', direction: 'desc' },
    limit: 1,
  })
  return latest?.state === 'Failed' ? latest : undefined
}

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

/** The faucet's ETH for the gas and its write of the USDC balance, read back to be sure. */
async function fundDepositAccount(
  backend: Backend,
  provider: JsonRpcProvider,
  account: string,
  amount: bigint,
): Promise<void> {
  const { service } = backend.ethereum.localFaucetV1
  if (service === null) throw new Error('the deposit test needs the local stack and its faucet')
  await service.fundAccount({ account })
  await service.fundErc20({ account, erc20Address: CIRCLE_USDC.toLowerCase(), amount })
  const observed = toBigInt(
    await provider.call({
      to: CIRCLE_USDC,
      data: ERC20.encodeFunctionData('balanceOf', [account]),
    }),
  )
  if (observed < amount) {
    throw new Error(`funded ${amount.toString()} USDC but balanceOf reads ${observed.toString()}`)
  }
}

const ERC20 = new Interface(['function balanceOf(address) view returns (uint256)'])
