import { randomBytes } from 'node:crypto'

import { getAddress, JsonRpcProvider } from 'ethers'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Backend } from '@/server/backend'

import { testBackend } from './backend'

/** The local faucet over the fork: the backend builds it for the local stack and it tops an account up by one ETH. */
describe('The local faucet over the local stack', () => {
  let backend: Backend
  let provider: JsonRpcProvider

  beforeAll(async () => {
    backend = await testBackend()
    provider = new JsonRpcProvider(backend.config.client.ethereum.rpcURL, undefined, {
      cacheTimeout: -1,
    })
  })

  afterAll(async () => {
    provider.destroy()
    await backend.stop()
    await backend.db.pool.end()
  })

  test('a fresh account holds one ETH after one call and two after another', async () => {
    const account = getAddress(`0x${randomBytes(20).toString('hex')}`).toLowerCase()
    const { adaptor } = backend.ethereum.localFaucetV1
    expect(backend.ethereum.localFaucetV1.service).not.toBeNull()
    await expect(adaptor.fundAccount({ account })).resolves.toEqual({
      ok: true,
      funding: { account, balance: 10n ** 18n },
    })
    await expect(adaptor.fundAccount({ account })).resolves.toEqual({
      ok: true,
      funding: { account, balance: 2n * 10n ** 18n },
    })
    expect(await provider.getBalance(account)).toBe(2n * 10n ** 18n)
  })
})
