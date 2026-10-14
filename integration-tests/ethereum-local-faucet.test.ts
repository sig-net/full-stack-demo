import { randomBytes } from 'node:crypto'

import { CIRCLE_USDC } from '@sig-net/midnight-examples-erc20-vault-contract'
import { getAddress, Interface, JsonRpcProvider, toBigInt } from 'ethers'
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

  test('a fresh account holds the USDC it is given, twice over on a second call', async () => {
    const account = getAddress(`0x${randomBytes(20).toString('hex')}`).toLowerCase()
    const erc20Address = CIRCLE_USDC.toLowerCase()
    const { adaptor } = backend.ethereum.localFaucetV1
    await expect(adaptor.fundErc20({ account, erc20Address, amount: 5_000_000n })).resolves.toEqual(
      {
        ok: true,
        funding: { account, erc20Address, balance: 5_000_000n },
      },
    )
    await expect(adaptor.fundErc20({ account, erc20Address, amount: 5_000_000n })).resolves.toEqual(
      {
        ok: true,
        funding: { account, erc20Address, balance: 10_000_000n },
      },
    )
    const erc20 = new Interface(['function balanceOf(address) view returns (uint256)'])
    expect(
      toBigInt(
        await provider.call({
          to: erc20Address,
          data: erc20.encodeFunctionData('balanceOf', [account]),
        }),
      ),
    ).toBe(10_000_000n)
  })
})
