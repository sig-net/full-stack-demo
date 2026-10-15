import type {
  DustSecretKey,
  SignatureVerifyingKey,
  Utxo,
  ZswapSecretKeys,
} from '@midnightntwrk/ledger-v9'
import type {
  FacadeState,
  UnprovenTransactionRecipe,
  UtxoWithMeta,
  WalletFacade,
} from '@midnightntwrk/wallet-sdk-facade'
import type {
  UnshieldedKeystore,
  UnshieldedWalletState,
} from '@midnightntwrk/wallet-sdk-unshielded-wallet'
import { describe, expect, test } from 'vitest'

import { registerNightForDust } from '@/lib/midnight/wallet/register-night-for-dust'
import type { AccountKeys } from '@/lib/midnight/wallet/seed-wallet-facade'
import { mock } from '@/lib/testing/mock'

function coin(value: bigint, registeredForDustGeneration: boolean): UtxoWithMeta {
  return {
    utxo: mock<Utxo>('Utxo', { value }),
    meta: { ctime: new Date(0), registeredForDustGeneration },
  }
}

function stateOf(coins: UtxoWithMeta[]): FacadeState {
  return mock<FacadeState>('FacadeState', {
    unshielded: mock<UnshieldedWalletState>('UnshieldedWalletState', { availableCoins: coins }),
  })
}

const PUBLIC_KEY: SignatureVerifyingKey = { tag: 'schnorr', value: 'aa'.repeat(32) }
const signDataAsync: UnshieldedKeystore['signDataAsync'] = () =>
  Promise.resolve({ tag: 'schnorr', value: 'signed' })

const keys: AccountKeys = {
  shieldedSecretKeys: mock<ZswapSecretKeys>('ZswapSecretKeys'),
  dustSecretKey: mock<DustSecretKey>('DustSecretKey'),
  unshieldedKeystore: mock<UnshieldedKeystore>('UnshieldedKeystore', {
    getPublicKey: () => PUBLIC_KEY,
    signDataAsync,
  }),
}

describe('registerNightForDust', () => {
  test('registers nothing and submits nothing when every coin is registered', async () => {
    const facade = mock<WalletFacade>('WalletFacade')
    expect(await registerNightForDust(facade, keys, stateOf([coin(5n, true)]))).toBe(0n)
  })

  test('registers the unregistered coins, their fee covered by their own generated DUST, and sums their NIGHT', async () => {
    const unregistered = [coin(5n, false), coin(7n, false)]
    const calls: string[] = []
    const recipe: UnprovenTransactionRecipe = mock<UnprovenTransactionRecipe>('Recipe')
    const finalized = mock<Awaited<ReturnType<WalletFacade['finalizeRecipe']>>>('Finalized')
    const facade = mock<WalletFacade>('WalletFacade', {
      estimateRegistration: (coins) => {
        expect(coins).toEqual(unregistered)
        calls.push('estimate')
        return Promise.resolve({ fee: 3n, dustGenerationEstimations: [] })
      },
      waitForGeneratedDust: (coins, required) => {
        expect(coins).toEqual(unregistered)
        expect(required).toBe(3n)
        calls.push('wait')
        return Promise.resolve()
      },
      registerNightUtxosForDustGeneration: (coins, key, sign) => {
        expect(coins).toEqual(unregistered)
        expect(key).toBe(PUBLIC_KEY)
        expect(sign).toBe(signDataAsync)
        calls.push('register')
        return Promise.resolve(recipe)
      },
      finalizeRecipe: (given) => {
        expect(given).toBe(recipe)
        calls.push('finalize')
        return Promise.resolve(finalized)
      },
      submitTransaction: (given) => {
        expect(given).toBe(finalized)
        calls.push('submit')
        return Promise.resolve('id')
      },
    })
    const state = stateOf([coin(100n, true), ...unregistered])
    expect(await registerNightForDust(facade, keys, state)).toBe(12n)
    expect(calls).toEqual(['estimate', 'wait', 'register', 'finalize', 'submit'])
  })
})
