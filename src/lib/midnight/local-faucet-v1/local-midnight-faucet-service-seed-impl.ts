import 'server-only'

import type { WalletFacade } from '@midnightntwrk/wallet-sdk-facade'

import type { MidnightNetworkConfig } from '@/lib/config/midnight-network-config'
import {
  type FundNightArgs,
  type LocalMidnightFaucetService,
  NIGHT_FAUCET_AMOUNT,
} from '@/lib/midnight/local-faucet-v1/local-midnight-faucet-service'
import type { NightFunding } from '@/lib/midnight/local-faucet-v1/night-funding'
import { registerNightForDust } from '@/lib/midnight/wallet/register-night-for-dust'
import {
  type AccountKeys,
  deriveAccountKeys,
  startSyncedSeedFacade,
} from '@/lib/midnight/wallet/seed-wallet-facade'
import { transferNight } from '@/lib/midnight/wallet/transfer-night'

/**
 * The faucet over the funding wallet's seed, its facade started on the first funding and kept
 * for the process. Fundings run one at a time: two transfers built from one state would reserve
 * the same coins.
 */
export class LocalMidnightFaucetServiceSeedImpl implements LocalMidnightFaucetService {
  private readonly config: MidnightNetworkConfig
  private readonly keys: AccountKeys
  private starting: Promise<WalletFacade> | undefined
  private queue: Promise<unknown> = Promise.resolve()

  constructor(config: MidnightNetworkConfig, seed: string) {
    this.config = config
    this.keys = deriveAccountKeys(seed, config.networkId)
  }

  fundNight(args: FundNightArgs): Promise<NightFunding> {
    const funding = this.queue.then(() => this.transfer(args))
    this.queue = funding.catch(() => undefined)
    return funding
  }

  private async transfer({
    unshieldedAddress,
    amount = NIGHT_FAUCET_AMOUNT,
  }: FundNightArgs): Promise<NightFunding> {
    const facade = await this.started()
    const state = await facade.waitForSyncedState()
    if (state.dust.balance(new Date()) < FUNDER_DUST_MINIMUM) {
      await registerNightForDust(facade, this.keys, state)
    }
    const transactionId = await transferNight(
      facade,
      this.keys,
      this.config.networkId,
      unshieldedAddress,
      amount,
    )
    return { unshieldedAddress, amount, transactionId }
  }

  private started(): Promise<WalletFacade> {
    this.starting ??= startSyncedSeedFacade(this.keys, this.config).catch((error: unknown) => {
      this.starting = undefined
      throw error
    })
    return this.starting
  }
}

/** One DUST in SPECK: a transfer's fee is a twentieth of it, so the funder registers NIGHT only once short. */
const FUNDER_DUST_MINIMUM = 1_000_000_000_000_000n
