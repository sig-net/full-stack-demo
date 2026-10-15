import type { FacadeState, WalletFacade } from '@midnightntwrk/wallet-sdk-facade'

import type { AccountKeys } from '@/lib/midnight/wallet/seed-wallet-facade'

/**
 * Registers every available NIGHT coin not yet registered for DUST generation, signing with the
 * unshielded keystore, and resolves with the NIGHT registered in STAR once the registration is in
 * a block: zero, with nothing submitted, when every coin already was.
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
  return coins.reduce((sum, coin) => sum + coin.utxo.value, 0n)
}

const GENERATED_DUST_TIMEOUT_MS = 300_000
