import {
  type DustSecretKey,
  nativeToken,
  type UnprovenTransaction,
  type ZswapSecretKeys,
} from '@midnightntwrk/ledger-v9'
import type {
  BalancingRecipe,
  UnprovenTransactionRecipe,
  WalletFacade,
} from '@midnightntwrk/wallet-sdk-facade'
import { createKeystore } from '@midnightntwrk/wallet-sdk-unshielded-wallet'
import { MidnightNetwork } from '@sig-net/midnight'
import { describe, expect, test } from 'vitest'

import type { AccountKeys } from '@/lib/midnight/wallet/seed-wallet-facade'
import { transferNight } from '@/lib/midnight/wallet/transfer-night'
import { mock } from '@/lib/testing/mock'

const NETWORK = MidnightNetwork.Undeployed
const keystore = createKeystore({ kind: 'schnorr', secret: new Uint8Array(32).fill(1) }, NETWORK)
const receiver = createKeystore({ kind: 'schnorr', secret: new Uint8Array(32).fill(2) }, NETWORK)
const RECEIVER_ADDRESS = receiver.getBech32Address().toString()

const keys: AccountKeys = {
  shieldedSecretKeys: mock<ZswapSecretKeys>('ZswapSecretKeys'),
  dustSecretKey: mock<DustSecretKey>('DustSecretKey'),
  unshieldedKeystore: keystore,
}

type Finalized = Awaited<ReturnType<WalletFacade['finalizeRecipe']>>

interface Scripted {
  readonly transfer: UnprovenTransactionRecipe
  readonly balanced: UnprovenTransactionRecipe
  readonly signed: BalancingRecipe
  readonly finalized: Finalized
  readonly calls: string[]
  readonly reverted: Array<Parameters<WalletFacade['revert']>[0]>
}

function scripted(): Scripted {
  return {
    transfer: { type: 'UNPROVEN_TRANSACTION', transaction: mock<UnprovenTransaction>('Transfer') },
    balanced: mock<UnprovenTransactionRecipe>('Balanced'),
    signed: mock<BalancingRecipe>('Signed'),
    finalized: mock<Finalized>('Finalized'),
    calls: [],
    reverted: [],
  }
}

/** A facade whose steps all succeed unless `failAt` names one. */
function facadeOver(script: Scripted, failAt?: 'balance' | 'finalize' | 'submit'): WalletFacade {
  const step = <T>(name: string, result: T): Promise<T> => {
    script.calls.push(name)
    return failAt === name ? Promise.reject(new Error(`${name} failed`)) : Promise.resolve(result)
  }
  return mock<WalletFacade>('WalletFacade', {
    transferTransaction: (outputs, _secretKeys, options) => {
      expect(outputs).toEqual([
        {
          type: 'unshielded',
          outputs: [
            {
              type: nativeToken().raw,
              receiverAddress: expect.objectContaining({ data: expect.anything() }),
              amount: 42n,
            },
          ],
        },
      ])
      expect(options.payFees).toBe(false)
      return step('transfer', script.transfer)
    },
    balanceUnprovenTransaction: (transaction, _secretKeys, options) => {
      expect(transaction).toBe(script.transfer.transaction)
      expect(options.tokenKindsToBalance).toEqual(['dust'])
      return step('balance', script.balanced)
    },
    signRecipe: (recipe, sign) => {
      expect(recipe).toBe(script.balanced)
      expect(sign).toBe(keystore.signDataAsync)
      return step('sign', script.signed)
    },
    finalizeRecipe: (recipe) => {
      expect(recipe).toBe(script.signed)
      return step('finalize', script.finalized)
    },
    submitTransaction: (transaction) => {
      expect(transaction).toBe(script.finalized)
      return step('submit', 'tx-id')
    },
    revert: (recipe) => {
      script.reverted.push(recipe)
      return Promise.resolve()
    },
  })
}

describe('transferNight', () => {
  test('builds, balances in DUST, signs, proves and submits one unshielded NIGHT output', async () => {
    const script = scripted()
    const facade = facadeOver(script)
    expect(await transferNight(facade, keys, NETWORK, RECEIVER_ADDRESS, 42n)).toBe('tx-id')
    expect(script.calls).toEqual(['transfer', 'balance', 'sign', 'finalize', 'submit'])
    expect(script.reverted).toEqual([])
  })

  test.each([
    { name: 'balancing', failAt: 'balance' as const, reverts: (s: Scripted) => [s.transfer] },
    { name: 'proving', failAt: 'finalize' as const, reverts: (s: Scripted) => [s.balanced] },
  ])('releases the reserved coins when $name fails', async ({ failAt, reverts }) => {
    const script = scripted()
    const facade = facadeOver(script, failAt)
    await expect(transferNight(facade, keys, NETWORK, RECEIVER_ADDRESS, 42n)).rejects.toThrow(
      `${failAt} failed`,
    )
    expect(script.reverted).toEqual(reverts(script))
  })

  test('keeps the coins reserved when the submission fails', async () => {
    const script = scripted()
    const facade = facadeOver(script, 'submit')
    await expect(transferNight(facade, keys, NETWORK, RECEIVER_ADDRESS, 42n)).rejects.toThrow(
      'submit failed',
    )
    expect(script.reverted).toEqual([])
  })

  test('refuses a receiver that is not an unshielded address before touching the facade', async () => {
    await expect(
      transferNight(
        mock<WalletFacade>('WalletFacade'),
        keys,
        NETWORK,
        'mn_shield-addr_undeployed1qq',
        1n,
      ),
    ).rejects.toThrow()
  })
})
