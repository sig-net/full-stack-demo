import { randomBytes } from 'node:crypto'

import {
  type PreBinding,
  type Proof,
  type SignatureEnabled,
  Transaction,
} from '@midnightntwrk/ledger-v9'
import { newInputIndex } from '@sig-net/midnight-examples-erc20-vault-contract'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Backend } from '@/server/backend'

import { testBackend } from './backend'
import { CIRCLE_USDC } from './sepolia-tokens'
import { userWalletPublicKeys, userWalletSeed } from './user-wallet'

/**
 * The deposit call builder, as the browser drives it, over the backend's own providers: a
 * start call built against the running indexer with a fresh caller secret and the user wallet's
 * keys, proven through the proof server, comes back as unbound bytes. Nothing is submitted and
 * no row is written, so there is nothing to delete and the ledger sees nothing.
 */
describe('Building a deposit start call over the indexer and the proof server', () => {
  let backend: Backend

  beforeAll(async () => {
    backend = await testBackend()
  })

  afterAll(async () => {
    await backend.db.pool.end()
  })

  test('buildStart returns unbound bytes the ledger deserialises as proven and unbound', async () => {
    const { callBuilder } = backend.midnight.ethereumErc20Vault.depositV1
    const started = Date.now()
    const unboundTx = await callBuilder.buildStart({
      secretKey: randomBytes(32),
      wallet: userWalletPublicKeys(userWalletSeed()),
      inIndex: newInputIndex(),
      // A fresh caller's deposit account has never sent a transaction.
      evmNonce: 0n,
      // The sweep envelope of `src/lib/midnight/ethereum-erc20-vault/sweep-gas.ts`, which a test may import only as a type.
      gas: {
        gasLimit: 100_000n,
        maxFeePerGas: 30_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
      },
      erc20Address: CIRCLE_USDC,
      amount: 1_000_000n,
    })
    console.log(`start call built and proved in ${String(Date.now() - started)} ms`)

    expect(unboundTx).toMatch(/^[0-9a-f]+$/)
    const unbound = Transaction.deserialize<SignatureEnabled, Proof, PreBinding>(
      'signature',
      'proof',
      'pre-binding',
      Uint8Array.from(Buffer.from(unboundTx, 'hex')),
    )
    expect(unbound.identifiers().length).toBeGreaterThan(0)
  })
})
