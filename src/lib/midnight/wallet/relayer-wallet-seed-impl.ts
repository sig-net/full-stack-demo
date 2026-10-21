import 'server-only'

import type { MidnightProvider, WalletProvider } from '@midnight-ntwrk/midnight-js/types'
import type { MidnightNetworkConfig } from '@/lib/config/midnight-network-config'
import { messageOf } from '@/lib/message-of'
import type { RelayerWallet } from '@/lib/midnight/wallet/relayer-wallet'
import {
  type AccountKeys,
  createWalletAndMidnightProvider,
  deriveAccountKeys,
  finalizeUnboundTransaction,
  type WalletFacade,
} from '@/lib/midnight/wallet/seed-wallet-facade'
import type { WalletPublicKeys } from '@/lib/midnight/wallet/wallet'

/** The relayer over a seed-derived wallet facade, the same facade the browser's seed wallet runs on. */
export class RelayerWalletSeedImpl implements RelayerWallet {
  private readonly config: MidnightNetworkConfig
  private readonly keys: AccountKeys
  private readonly startFacade: StartSyncedFacade
  private starting: Promise<StartedWallet> | undefined
  /** Set once the first sync completes and kept from then on. */
  private synced: StartedWallet | undefined
  /** The reason the last start failed, cleared by a start that completes. */
  private startFailure: string | undefined

  constructor(config: MidnightNetworkConfig, seed: string, startFacade: StartSyncedFacade) {
    this.config = config
    this.keys = deriveAccountKeys(seed, config.networkId)
    this.startFacade = startFacade
  }

  async start(): Promise<void> {
    await this.started()
  }

  publicKeys(): WalletPublicKeys {
    return {
      coinPublicKey: this.keys.shieldedSecretKeys.coinPublicKey,
      encryptionPublicKey: this.keys.shieldedSecretKeys.encryptionPublicKey,
    }
  }

  unshieldedAddress(): string {
    return this.keys.unshieldedKeystore.getBech32Address().toString()
  }

  async dustBalance(): Promise<bigint> {
    if (this.synced === undefined) {
      const failure = this.startFailure
      // The failure is recorded by `started()` and reported by the next call.
      this.started().catch(() => undefined)
      throw new Error(
        failure === undefined
          ? 'The relayer wallet is still synchronising.'
          : `The relayer wallet failed to start and is retrying: ${failure}`,
      )
    }
    const state = await this.synced.facade.waitForSyncedState()
    return state.dust.balance(new Date())
  }

  async finalize(unboundTx: string): Promise<string> {
    return finalizeUnboundTransaction((await this.requireStarted()).provider, unboundTx)
  }

  /** The start in progress, refused when nothing started the wallet, so a finalise never starts a sync of its own. */
  private requireStarted(): Promise<StartedWallet> {
    if (this.starting === undefined) {
      throw new Error('The relayer wallet was not started: start the backend first')
    }
    return this.starting
  }

  async provider(): Promise<WalletProvider & MidnightProvider> {
    return (await this.started()).provider
  }

  private started(): Promise<StartedWallet> {
    this.starting ??= this.sync().then(
      (wallet) => {
        this.synced = wallet
        this.startFailure = undefined
        return wallet
      },
      (error: unknown) => {
        this.starting = undefined
        this.startFailure = messageOf(error)
        throw error
      },
    )
    return this.starting
  }

  private async sync(): Promise<StartedWallet> {
    const facade = await this.startFacade(this.keys, this.config)
    return { facade, provider: createWalletAndMidnightProvider(facade, this.keys) }
  }
}

/** Starts a facade over the keys and resolves once its first sync completes, as `startSyncedSeedFacade` does. */
export type StartSyncedFacade = (
  keys: AccountKeys,
  config: MidnightNetworkConfig,
) => Promise<WalletFacade>

interface StartedWallet {
  readonly facade: WalletFacade
  readonly provider: WalletProvider & MidnightProvider
}
