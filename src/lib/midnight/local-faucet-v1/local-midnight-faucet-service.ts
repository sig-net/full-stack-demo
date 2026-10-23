import { z } from 'zod'

import type { NightFunding } from '@/lib/midnight/local-faucet-v1/night-funding'
import { uint128Schema, unshieldedAddressSchema } from '@/lib/value-schemas'

/**
 * Free NIGHT for any wallet on the local chain, sent by a plain transfer from the network's
 * genesis mint wallet. The backend builds this service for the local stack only, so no caller is
 * involved and no deployed chain can be reached through it.
 */
export interface LocalMidnightFaucetService {
  /** Sends `amount` STAR, `NIGHT_FAUCET_AMOUNT` when unset, to the wallet's unshielded address. */
  fundNight(args: FundNightArgs): Promise<NightFunding>
}

export const fundNightArgsSchema = z.object({
  unshieldedAddress: unshieldedAddressSchema,
  /** In STAR. */
  amount: uint128Schema.pipe(z.bigint().positive()).optional(),
})
export type FundNightArgs = z.infer<typeof fundNightArgsSchema>

/** One million NIGHT in STAR, about a thirtieth of the genesis wallet's reserve on the local chain. */
export const NIGHT_FAUCET_AMOUNT = 1_000_000_000_000n

/** The seed of the wallet an undeployed network mints its genesis NIGHT to, public by construction. */
export const GENESIS_MINT_WALLET_SEED = `${'0'.repeat(63)}1`
