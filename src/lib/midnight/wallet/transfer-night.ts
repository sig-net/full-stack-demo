import { nativeToken } from '@midnightntwrk/ledger-v9'
import { MidnightBech32m, UnshieldedAddress } from '@midnightntwrk/wallet-sdk-address-format'
import type { BalancingRecipe, WalletFacade } from '@midnightntwrk/wallet-sdk-facade'

import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import type { AccountKeys } from '@/lib/midnight/wallet/seed-wallet-facade'

/**
 * Sends `amount` STAR of unshielded NIGHT from the facade's own coins to the bech32m address,
 * the fee paid in the sender's DUST, and resolves with the transaction's identifier once it is
 * in a block. The coins a failed build reserved are released, while a failed submission keeps
 * them reserved since the node may hold the bytes.
 */
export async function transferNight(
  facade: WalletFacade,
  keys: AccountKeys,
  networkId: MidnightNetworkId,
  receiverAddress: string,
  amount: bigint,
): Promise<string> {
  const receiver = MidnightBech32m.parse(receiverAddress).decode(UnshieldedAddress, networkId)
  const secretKeys = {
    shieldedSecretKeys: keys.shieldedSecretKeys,
    dustSecretKey: keys.dustSecretKey,
  }
  const ttl = new Date(Date.now() + TRANSFER_TTL_MS)
  let recipe: BalancingRecipe = await facade.transferTransaction(
    [
      {
        type: 'unshielded',
        outputs: [{ type: nativeToken().raw, receiverAddress: receiver, amount }],
      },
    ],
    secretKeys,
    { ttl, payFees: false },
  )
  let finalized: Awaited<ReturnType<WalletFacade['finalizeRecipe']>>
  try {
    recipe = await facade.balanceUnprovenTransaction(recipe.transaction, secretKeys, {
      ttl,
      tokenKindsToBalance: ['dust'],
    })
    const signed = await facade.signRecipe(recipe, keys.unshieldedKeystore.signDataAsync)
    finalized = await facade.finalizeRecipe(signed)
  } catch (error: unknown) {
    await facade.revert(recipe).catch(() => undefined)
    throw error
  }
  return facade.submitTransaction(finalized)
}

/** The transfer and its balancing expire together, half an hour out. */
const TRANSFER_TTL_MS = 30 * 60 * 1000
