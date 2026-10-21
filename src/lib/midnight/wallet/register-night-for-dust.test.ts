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

describe('registerNightForDust', () => {
  const registered = coin(1, 100n, true)
  const unregistered = [coin(2, 5n, false), coin(3, 7n, false)]
  const reissued = [coin(4, 5n, true), coin(5, 7n, true)]
  const cases: ReadonlyArray<{
    name: string
    held: UtxoWithMeta[]
    /** The wallet states the facade emits once the registration is submitted. */
    synced: FacadeState[]
    expected: { registered: bigint } | { error: string }
    calls: string[]
  }> = [
    {
      name: 'registers nothing and submits nothing when every coin is registered',
      held: [registered],
      synced: [],
      expected: { registered: 0n },
      calls: [],
    },
    {
      name: 'registers the unregistered coins, their fee covered by their own generated DUST, once the wallet holds the registered coins',
      held: [registered, ...unregistered],
      synced: [
        stateOf({ available: [registered], pending: unregistered }),
        stateOf({ available: [registered, ...reissued], pending: [] }),
      ],
      expected: { registered: 12n },
      calls: ['estimate', 'wait', 'register', 'finalize', 'submit'],
    },
    {
      name: 'refuses when the wallet returns the coins to available',
      held: unregistered,
      synced: [
        stateOf({ available: [], pending: unregistered }),
        stateOf({ available: unregistered, pending: [] }),
      ],
      expected: { error: 'The registration failed on chain.' },
      calls: ['estimate', 'wait', 'register', 'finalize', 'submit'],
    },
  ]
  test.each(cases)('$name', async ({ held, synced, expected, calls }) => {
    const made: string[] = []
    const toRegister = held.filter(({ meta }) => !meta.registeredForDustGeneration)
    const recipe = mock<UnprovenTransactionRecipe>('Recipe')
    const finalized = mock<Awaited<ReturnType<WalletFacade['finalizeRecipe']>>>('Finalized')
    const facade = mock<WalletFacade>('WalletFacade', {
      estimateRegistration: (coins) => {
        expect(coins).toEqual(toRegister)
        made.push('estimate')
        return Promise.resolve({ fee: 3n, dustGenerationEstimations: [] })
      },
      waitForGeneratedDust: (coins, required) => {
        expect(coins).toEqual(toRegister)
        expect(required).toBe(3n)
        made.push('wait')
        return Promise.resolve()
      },
      registerNightUtxosForDustGeneration: (coins, key, sign) => {
        expect(coins).toEqual(toRegister)
        expect(key).toBe(PUBLIC_KEY)
        expect(sign).toBe(signDataAsync)
        made.push('register')
        return Promise.resolve(recipe)
      },
      finalizeRecipe: (given) => {
        expect(given).toBe(recipe)
        made.push('finalize')
        return Promise.resolve(finalized)
      },
      submitTransaction: (given) => {
        expect(given).toBe(finalized)
        made.push('submit')
        return Promise.resolve('id')
      },
      state: () => stateStream(synced),
    })
    const registering = registerNightForDust(
      facade,
      keys,
      stateOf({ available: held, pending: [] }),
    )
    if ('error' in expected) {
      await expect(registering).rejects.toThrow(expected.error)
    } else {
      expect(await registering).toBe(expected.registered)
    }
    expect(made).toEqual(calls)
  })
})

type StateStream = ReturnType<WalletFacade['state']>

function coin(outputNo: number, value: bigint, registeredForDustGeneration: boolean): UtxoWithMeta {
  return {
    utxo: mock<Utxo>('Utxo', { value, intentHash: 'ab'.repeat(32), outputNo }),
    meta: { ctime: new Date(0), registeredForDustGeneration },
  }
}

function stateOf(coins: { available: UtxoWithMeta[]; pending: UtxoWithMeta[] }): FacadeState {
  return mock<FacadeState>('FacadeState', {
    unshielded: mock<UnshieldedWalletState>('UnshieldedWalletState', {
      availableCoins: coins.available,
      pendingCoins: coins.pending,
    }),
  })
}

/** Emits the states during subscribe, the earliest a state can arrive. */
function stateStream(states: FacadeState[]): StateStream {
  return mock<StateStream>('StateStream', {
    subscribe: (
      observer?: { next?: (state: FacadeState) => void } | ((state: FacadeState) => void) | null,
    ) => {
      const next = typeof observer === 'function' ? observer : observer?.next
      for (const state of states) next?.(state)
      return mock<ReturnType<StateStream['subscribe']>>('Subscription', {
        unsubscribe: () => undefined,
      })
    },
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
