import { randomBytes } from 'node:crypto'

import { JsonRpcProvider, toBeHex } from 'ethers'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { LoginCredential } from '@/lib/caller/login-credential'
import type { Backend } from '@/server/backend'

import { testBackend } from './backend'
import { userCommitmentOf } from './user-caller-call'
import { userWalletLogin } from './user-wallet'

/**
 * The readiness checks over the local stack: the relayer's DUST from its synced wallet, the
 * caller's deposit account and the vault account from the fork, the vault's requirement from
 * the ledger. A fresh vault secret's deposit account is empty until the test funds it.
 */
describe('Vault readiness over the local stack', () => {
  let backend: Backend
  let provider: JsonRpcProvider
  /** A fresh caller's login, signed on every call so it is always within its window. */
  let login: () => LoginCredential
  const userSeed = randomBytes(32).toString('hex')
  const vaultSecret = randomBytes(32).toString('hex')
  const userCommitment = userCommitmentOf(vaultSecret)

  beforeAll(async () => {
    backend = await testBackend()
    const { networkId } = backend.config.client.midnightNetwork
    login = () => userWalletLogin(userSeed, networkId)
    provider = new JsonRpcProvider(backend.config.client.ethereum.rpcURL)
    await backend.midnight.relayerWallet.start()
  }, 300_000)

  afterAll(async () => {
    provider.destroy()
    await backend.stop()
    await backend.db.pool.end()
  })

  test('a fresh caller is short of ETH at its deposit account, and the other payers are read', async () => {
    const result = await backend.midnight.ethereumErc20Vault.readinessV1.adaptor.getVaultReadiness(
      login(),
      { userCommitment },
    )
    if (!result.ok) throw new Error(result.error)
    const { relayerDust, depositAccountEth, vaultAccountEth } = result.readiness
    expect(depositAccountEth).toMatchObject({
      status: 'insufficient',
      asset: 'ETH',
      available: 0n,
      required: 100_000n * 30_000_000_000n,
    })
    expect(relayerDust.status).not.toBe('unavailable')
    expect(relayerDust.account).toMatch(/^mn_addr_/)
    expect(vaultAccountEth.status).not.toBe('unavailable')
    if (vaultAccountEth.status !== 'unavailable') {
      expect(vaultAccountEth.required).toBeGreaterThan(0n)
    }
  })

  test('the deposit account is ready once it holds the sweep budget', async () => {
    const { adaptor } = backend.midnight.ethereumErc20Vault.readinessV1
    const before = await adaptor.getVaultReadiness(login(), { userCommitment })
    if (!before.ok) throw new Error(before.error)
    const account = before.readiness.depositAccountEth.account
    await provider.send('anvil_setBalance', [account, toBeHex(10n ** 18n)])
    // The readiness reads the finalised state, which anvil keeps two blocks behind its head.
    await provider.send('anvil_mine', [toBeHex(2)])
    const after = await adaptor.getVaultReadiness(login(), { userCommitment })
    if (!after.ok) throw new Error(after.error)
    expect(after.readiness.depositAccountEth).toMatchObject({
      status: 'ok',
      available: 10n ** 18n,
    })
  })
})
