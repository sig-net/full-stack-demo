import { randomBytes } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Backend } from '@/server/backend'

import { testBackend } from './backend'
import { startUserWallet, type UserWallet } from './user-wallet'

/** One thousand NIGHT in STAR, small enough to send many times from the genesis reserve. */
const AMOUNT = 1_000_000_000n

/** The genesis wallet syncs on the first funding, the transfer proves, and the receiver syncs the coin. */
const FUNDING_TIMEOUT_MS = 5 * 60_000

/** The NIGHT faucet over the local chain: the backend builds it for the local stack and a fresh wallet sees what it sends. */
describe('The local NIGHT faucet over the local stack', () => {
  let backend: Backend
  let receiver: UserWallet | undefined

  beforeAll(async () => {
    backend = await testBackend()
  })

  afterAll(async () => {
    await receiver?.stop()
    await backend.stop()
    await backend.db.pool.end()
  })

  test(
    'a fresh wallet holds the NIGHT the faucet sends it',
    async () => {
      const { adaptor, service } = backend.midnight.localFaucetV1
      expect(service).not.toBeNull()
      receiver = await startUserWallet(
        randomBytes(32).toString('hex'),
        backend.config.client.midnightNetwork,
      )
      const { unshieldedAddress } = receiver
      expect(await receiver.nightBalance()).toBe(0n)
      await expect(adaptor.fundNight({ unshieldedAddress, amount: AMOUNT })).resolves.toEqual({
        ok: true,
        funding: { unshieldedAddress, amount: AMOUNT, transactionId: expect.any(String) },
      })
      const deadline = Date.now() + FUNDING_TIMEOUT_MS
      let night = await receiver.nightBalance()
      while (night < AMOUNT && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 3_000))
        night = await receiver.nightBalance()
      }
      expect(night).toBe(AMOUNT)
    },
    FUNDING_TIMEOUT_MS + 60_000,
  )

  test('a shielded address is refused without a transfer', async () => {
    await expect(
      backend.midnight.localFaucetV1.adaptor.fundNight({
        unshieldedAddress: 'mn_shield-addr_undeployed1qq',
      }),
    ).resolves.toMatchObject({ ok: false })
  })
})
