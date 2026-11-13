import type { FacadeState, UtxoWithMeta, WalletFacade } from '@midnightntwrk/wallet-sdk-facade'

import type { AccountKeys } from '@/lib/midnight/wallet/seed-wallet-facade'

/**
 * Registers every available NIGHT coin not yet registered for DUST generation, signing with the
 * unshielded keystore, and resolves with the NIGHT registered in STAR once the wallet's own state
 * holds the registered coins in their place: zero, with nothing submitted, when every coin
 * already was.
 */
export async function registerNightForDust(
  facade: WalletFacade,
  keys: AccountKeys,
  state: FacadeState,
): Promise<bigint> {
  const coins = state.unshielded.availableCoins.filter(
    (coin) => !coin.meta.registeredForDustGeneration,
  )
  if (coins.length === 0) return 0n
  const estimate = await facade.estimateRegistration(coins)
  // The registration pays its own fee from the DUST the coins it registers are projected to generate.
  await facade.waitForGeneratedDust(coins, estimate.fee, { timeoutMs: GENERATED_DUST_TIMEOUT_MS })
  const recipe = await facade.registerNightUtxosForDustGeneration(
    coins,
    keys.unshieldedKeystore.getPublicKey(),
    keys.unshieldedKeystore.signDataAsync,
  )
  await facade.submitTransaction(await facade.finalizeRecipe(recipe))
  await untilWalletSpent(facade, coins)
  return coins.reduce((sum, coin) => sum + coin.utxo.value, 0n)
}

const GENERATED_DUST_TIMEOUT_MS = 300_000
const WALLET_SPENT_TIMEOUT_MS = 300_000

/**
 * Resolves once the wallet has synchronised the block that spent the coins, which in the same
 * update makes the registered coins available, and rejects when the coins return to available.
 */
function untilWalletSpent(facade: WalletFacade, coins: readonly UtxoWithMeta[]): Promise<void> {
  const keyOf = ({ utxo }: UtxoWithMeta): string => `${utxo.intentHash}#${utxo.outputNo}`
  const spent = new Set(coins.map(keyOf))
  return new Promise((resolve, reject) => {
    let settled = false
    let subscription: StateSubscription | undefined
    const settle = (outcome: () => void): void => {
      settled = true
      clearTimeout(timer)
      subscription?.unsubscribe()
      outcome()
    }
    const timer = setTimeout(() => {
      settle(() => {
        reject(new Error('The registration is submitted but the wallet has not synchronised it.'))
      })
    }, WALLET_SPENT_TIMEOUT_MS)
    subscription = facade.state().subscribe({
      next: ({ unshielded }) => {
        if (settled) return
        if (unshielded.availableCoins.some((coin) => spent.has(keyOf(coin)))) {
          settle(() => {
            reject(new Error('The registration failed on chain.'))
          })
        } else if (!unshielded.pendingCoins.some((coin) => spent.has(keyOf(coin)))) {
          settle(resolve)
        }
      },
      error: (error: unknown) => {
        settle(() => {
          reject(error instanceof Error ? error : new Error(String(error)))
        })
      },
    })
    // A state emitted during subscribe can settle the wait before the subscription exists.
    if (settled) subscription.unsubscribe()
  })
}

type StateSubscription = ReturnType<ReturnType<WalletFacade['state']>['subscribe']>
