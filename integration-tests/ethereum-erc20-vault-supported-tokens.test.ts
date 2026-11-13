import { randomBytes } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Backend } from '@/server/backend'

import { testBackend } from './backend'
import { userCommitmentOf } from './user-caller-call'
import { userWalletLogin } from './user-wallet'
import { CIRCLE_USDC } from './sepolia-tokens'

/** The vault's allowlist read from the indexer and each token's metadata read from the fork. */
describe('The vault allowlist over the local stack', () => {
  let backend: Backend

  beforeAll(async () => {
    backend = await testBackend()
  })

  afterAll(async () => {
    await backend.stop()
    await backend.db.pool.end()
  })

  test('listSupportedTokens reads the allowlist with the metadata each contract reports', async () => {
    const tokens =
      await backend.midnight.ethereumErc20Vault.supportedTokenV1.service.listSupportedTokens({})
    expect(tokens.length).toBeGreaterThan(0)
    expect(tokens.find((token) => token.erc20Address === CIRCLE_USDC.toLowerCase())).toMatchObject({
      symbol: 'USDC',
      decimals: 6,
    })
  })

  test('a fresh vault secret holds no funds at its deposit account', async () => {
    const result =
      await backend.midnight.ethereumErc20Vault.supportedTokenV1.adaptor.listDepositAccountFunds(
        userWalletLogin(
          randomBytes(32).toString('hex'),
          backend.config.client.midnightNetwork.networkId,
        ),
        { userCommitment: userCommitmentOf(randomBytes(32).toString('hex')) },
      )
    expect(result).toEqual({ ok: true, funds: [] })
  })
})
