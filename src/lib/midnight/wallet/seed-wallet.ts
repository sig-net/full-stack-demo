import { setNetworkId } from '@midnight-ntwrk/midnight-js/network-id'
import { DustAddress, MidnightBech32m } from '@midnightntwrk/wallet-sdk-address-format'

import type { MidnightNetworkConfig } from '@/lib/config/midnight-network-config'
import { registerNightForDust } from '@/lib/midnight/wallet/register-night-for-dust'
import { shieldedAddressOf } from '@/lib/midnight/wallet/shielded-address'
import {
  type AccountKeys,
  createWalletAndMidnightProvider,
  deriveAccountKeys,
  finalizeUnboundTransaction,
  initialiseWalletFacade,
  SYNC_BATCH_SIZES,
  type WalletFacade,
} from '@/lib/midnight/wallet/seed-wallet-facade'
import type { Wallet, WalletAddresses, WalletPublicKeys } from '@/lib/midnight/wallet/wallet'
import {
  type WalletSyncProgress,
  walletSyncProgress,
} from '@/lib/midnight/wallet/wallet-sync-progress'

type State = Awaited<ReturnType<WalletFacade['waitForSyncedState']>>
type SeedWalletProvider = ReturnType<typeof createWalletAndMidnightProvider>
type StateSubscription = ReturnType<ReturnType<WalletFacade['state']>['subscribe']>

const DISCONNECTED = 'Wallet disconnected.'
const SYNCHRONISING = 'Wallet is still synchronising.'

/**
 * Owns seed-derived keys, synchronisation and DUST registration for one disposable wallet
 * session. Registration and the unregistered NIGHT read are the seed wallet's own, outside
 * `Wallet`, since the DApp connector serves neither and a browser wallet registers NIGHT in its
 * own interface.
 */
export class SeedWallet implements Wallet {
  readonly kind = 'seed'
  readonly name = 'Seed wallet'
  private facade?: WalletFacade
  private provider?: SeedWalletProvider
  private latestState?: State
  private subscription?: StateSubscription
  private work?: Promise<void>
  private initialising?: Promise<void>
  private stopping?: Promise<void>
  private stopped = false
  private cancel?: () => void
  private walletAddresses?: WalletAddresses
  private keys?: AccountKeys
  /** The registration in flight, so a second click joins it. */
  private registration?: Promise<bigint>
  private readonly configuration: MidnightNetworkConfig
  /** Cleared after derivation or disconnect. */
  private seed: string

  /**
   * Captures startup inputs until explicit initialisation consumes the seed.
   *
   * @param configuration - Validated wallet endpoints and network.
   * @param seed - Transient hex seed.
   */
  constructor(configuration: MidnightNetworkConfig, seed: string) {
    this.configuration = configuration
    this.seed = seed
  }

  /**
   * Coalesces concurrent initialisation while allowing disconnect to reject pending callers.
   *
   * @param onProgress - Receives synchronisation progress for this session.
   * @param onAddresses - Receives the public addresses derived for this session.
   * @returns Completion once addresses and balances have synchronised.
   * @throws {Error} If seed derivation, synchronisation or ownership fails.
   */
  initialise(
    onProgress: (progress: WalletSyncProgress) => void = () => undefined,
    onAddresses: (addresses: WalletAddresses) => void = () => undefined,
  ): Promise<void> {
    if (this.stopped) return Promise.reject(new Error(DISCONNECTED))
    if (this.initialising) return this.initialising
    const cancelled = new Promise<never>((_resolve, reject) => {
      this.cancel = () => {
        reject(new Error(DISCONNECTED))
      }
    })
    this.work = this.start(onProgress, onAddresses)
    this.initialising = Promise.race([this.work, cancelled])
    return this.initialising
  }

  private assertActive(): void {
    if (this.stopped) throw new Error(DISCONNECTED)
  }

  private async start(
    onProgress: (progress: WalletSyncProgress) => void,
    onAddresses: (addresses: WalletAddresses) => void,
  ): Promise<void> {
    try {
      setNetworkId(this.configuration.networkId)
      const keys = deriveAccountKeys(this.seed, this.configuration.networkId)
      this.keys = keys
      this.walletAddresses = Object.freeze({
        shieldedAddress: shieldedAddressOf(keys.shieldedSecretKeys, this.configuration.networkId),
        unshieldedAddress: keys.unshieldedKeystore.getBech32Address().toString(),
        dustAddress: MidnightBech32m.encode(
          this.configuration.networkId,
          new DustAddress(keys.dustSecretKey.publicKey),
        ).toString(),
      })
      this.seed = ''
      this.assertActive()
      onAddresses(this.walletAddresses)
      const facade = await initialiseWalletFacade(
        keys,
        this.configuration,
        SYNC_BATCH_SIZES.browser,
      )
      this.facade = facade
      this.assertActive()
      await facade.start(keys.shieldedSecretKeys, keys.dustSecretKey)
      this.assertActive()
      this.provider = createWalletAndMidnightProvider(facade, keys)
      await new Promise<void>((resolve, reject) => {
        this.subscription = facade.state().subscribe({
          next: (state) => {
            if (this.stopped) return
            this.latestState = state
            onProgress(walletSyncProgress(state))
            if (state.isSynced) resolve()
          },
          error: reject,
          complete: () => {
            reject(new Error('Wallet synchronisation ended.'))
          },
        })
        const cancel = this.cancel
        this.cancel = () => {
          cancel?.()
          reject(new Error(DISCONNECTED))
        }
      })
      this.assertActive()
    } catch (error) {
      this.stopped = true
      this.seed = ''
      await this.stopFacade()
      throw error
    }
  }

  private stopFacade(): Promise<void> {
    this.subscription?.unsubscribe()
    this.subscription = undefined
    this.provider = undefined
    this.latestState = undefined
    this.keys = undefined
    this.walletAddresses = undefined
    if (!this.facade) return Promise.resolve()
    this.stopping ??= this.facade.stop()
    return this.stopping
  }

  disconnect(): Promise<void> {
    this.stopped = true
    this.seed = ''
    this.cancel?.()
    this.subscription?.unsubscribe()
    this.subscription = undefined
    this.provider = undefined
    this.latestState = undefined
    this.keys = undefined
    this.walletAddresses = undefined
    // A start already in flight can open connections after stop, so teardown awaits it.
    return (this.work ?? Promise.resolve()).catch(() => undefined).then(() => this.stopFacade())
  }

  private requireProvider(): SeedWalletProvider {
    this.assertActive()
    if (!this.provider) throw new Error(SYNCHRONISING)
    return this.provider
  }

  private state(): State {
    this.assertActive()
    if (!this.latestState) throw new Error(SYNCHRONISING)
    return this.latestState
  }

  get addresses(): WalletAddresses {
    this.assertActive()
    if (!this.walletAddresses) throw new Error(SYNCHRONISING)
    return this.walletAddresses
  }

  get publicKeys(): WalletPublicKeys {
    this.assertActive()
    if (!this.keys) throw new Error(SYNCHRONISING)
    return {
      coinPublicKey: this.keys.shieldedSecretKeys.coinPublicKey,
      encryptionPublicKey: this.keys.shieldedSecretKeys.encryptionPublicKey,
    }
  }

  /** The seed wallet pays the fee of every transaction it balances, so `payFees: false` is refused. */
  async balanceUnsealedTransaction(
    tx: string,
    options?: { payFees?: boolean },
  ): Promise<{ tx: string }> {
    if (options?.payFees === false) {
      throw new Error('The seed wallet pays the fee of every transaction it balances.')
    }
    return { tx: await finalizeUnboundTransaction(this.requireProvider(), tx) }
  }

  private requireKeys(): { facade: WalletFacade; keys: AccountKeys } {
    this.assertActive()
    const { facade, keys } = this
    if (!facade || !keys) throw new Error(SYNCHRONISING)
    return { facade, keys }
  }

  /**
   * Registers every NIGHT coin the wallet holds unregistered for DUST generation and resolves
   * with the NIGHT registered in STAR once the wallet's own state holds the registered coins:
   * zero when every coin already was.
   *
   * @throws {Error} If registration or session ownership fails.
   */
  registerNightForDust(): Promise<bigint> {
    this.assertActive()
    this.registration ??= this.register().finally(() => {
      this.registration = undefined
    })
    return this.registration
  }

  private async register(): Promise<bigint> {
    const { facade, keys } = this.requireKeys()
    return registerNightForDust(facade, keys, this.state())
  }

  getShieldedBalances(): Promise<Record<string, bigint>> {
    return this.readState((state) =>
      state.shielded.capabilities.coinsAndBalances.getTotalBalances(state.shielded.state),
    )
  }
  getUnshieldedBalances(): Promise<Record<string, bigint>> {
    return this.readState((state) => state.unshielded.balances)
  }
  /** The cap is what every DUST coin the wallet holds can grow to, in SPECK. */
  getDustBalance(): Promise<{ cap: bigint; balance: bigint }> {
    return this.readState((state) => ({
      cap: state.dust.totalCoins.reduce((sum, coin) => sum + coin.maxCap, 0n),
      balance: state.dust.balance(new Date()),
    }))
  }
  /** Available NIGHT not registered for DUST generation, in STAR. */
  getUnregisteredNightBalance(): Promise<bigint> {
    return this.readState((state) =>
      state.unshielded.availableCoins.reduce(
        (sum, coin) => (coin.meta.registeredForDustGeneration ? sum : sum + coin.utxo.value),
        0n,
      ),
    )
  }

  private readState<Result>(read: (state: State) => Result): Promise<Result> {
    return new Promise((resolve) => {
      resolve(read(this.state()))
    })
  }
}
