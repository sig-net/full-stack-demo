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
  releaseFinalizedTransaction,
  type WalletFacade,
} from '@/lib/midnight/wallet/seed-wallet-facade'
import type {
  Wallet,
  WalletAddressSnapshot,
  WalletPublicKeys,
  WalletTransactions,
} from '@/lib/midnight/wallet/wallet'
import {
  type WalletSyncProgress,
  walletSyncProgress,
} from '@/lib/midnight/wallet/wallet-sync-progress'

type State = Awaited<ReturnType<WalletFacade['waitForSyncedState']>>
type SeedWalletProvider = ReturnType<typeof createWalletAndMidnightProvider>
type StateSubscription = ReturnType<ReturnType<WalletFacade['state']>['subscribe']>

const DISCONNECTED = 'Wallet disconnected.'
const SYNCHRONISING = 'Wallet is still synchronising.'

/** Owns seed-derived keys, synchronisation and DUST registration for one disposable wallet session. */
export class SeedWallet implements Wallet {
  readonly kind = 'seed'
  readonly name = 'Seed wallet'
  readonly iconUrl = undefined
  get id(): string {
    return this.shieldedAddress
  }
  get accountDetail(): string {
    return this.shieldedAddress
  }
  get transactions(): WalletTransactions {
    return this
  }
  private facade?: WalletFacade
  private provider?: SeedWalletProvider
  private latestState?: State
  private subscription?: StateSubscription
  private work?: Promise<void>
  private initialising?: Promise<void>
  private stopping?: Promise<void>
  private stopped = false
  private cancel?: () => void
  private shielded = ''
  private unshielded = ''
  private dust = ''
  private keys?: AccountKeys
  /** The registration in flight, so a second click joins it. */
  private registration?: Promise<bigint>
  readonly configuration: MidnightNetworkConfig
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
    onAddresses: (snapshot: WalletAddressSnapshot) => void = () => undefined,
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
    onAddresses: (snapshot: WalletAddressSnapshot) => void,
  ): Promise<void> {
    try {
      setNetworkId(this.configuration.networkId)
      const keys = deriveAccountKeys(this.seed, this.configuration.networkId)
      this.keys = keys
      this.shielded = shieldedAddressOf(keys.shieldedSecretKeys, this.configuration.networkId)
      this.unshielded = keys.unshieldedKeystore.getBech32Address().toString()
      this.dust = MidnightBech32m.encode(
        this.configuration.networkId,
        new DustAddress(keys.dustSecretKey.publicKey),
      ).toString()
      this.seed = ''
      this.assertActive()
      onAddresses(
        Object.freeze({
          networkId: this.configuration.networkId,
          shieldedAddress: this.shielded,
          unshieldedAddress: this.unshielded,
          dustAddress: this.dust,
        }),
      )
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
    this.shielded = ''
    this.unshielded = ''
    this.dust = ''
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
    this.shielded = ''
    this.unshielded = ''
    this.dust = ''
    // A start already in flight can open connections after stop, so teardown awaits it.
    return (this.work ?? Promise.resolve()).catch(() => undefined).then(() => this.stopFacade())
  }

  private requireProvider(): SeedWalletProvider {
    this.assertActive()
    if (!this.provider) throw new Error(SYNCHRONISING)
    return this.provider
  }

  get shieldedAddress(): string {
    this.assertActive()
    return this.shielded
  }
  getCoinPublicKey: WalletTransactions['getCoinPublicKey'] = () =>
    this.requireProvider().getCoinPublicKey()
  getEncryptionPublicKey: WalletTransactions['getEncryptionPublicKey'] = () =>
    this.requireProvider().getEncryptionPublicKey()
  balanceTx: WalletTransactions['balanceTx'] = (tx, ttl) =>
    this.requireProvider().balanceTx(tx, ttl)
  submitTx: WalletTransactions['submitTx'] = (tx) => this.requireProvider().submitTx(tx)

  private state(): State {
    this.assertActive()
    if (!this.latestState) throw new Error(SYNCHRONISING)
    return this.latestState
  }

  get unshieldedAddress(): string {
    this.assertActive()
    if (!this.unshielded) throw new Error(SYNCHRONISING)
    return this.unshielded
  }

  get dustAddress(): string {
    this.assertActive()
    if (!this.dust) throw new Error(SYNCHRONISING)
    return this.dust
  }

  get publicKeys(): WalletPublicKeys {
    this.assertActive()
    if (!this.keys) throw new Error(SYNCHRONISING)
    return {
      coinPublicKey: this.keys.shieldedSecretKeys.coinPublicKey,
      encryptionPublicKey: this.keys.shieldedSecretKeys.encryptionPublicKey,
    }
  }

  finalize(unboundTx: string): Promise<string> {
    return finalizeUnboundTransaction(this.requireProvider(), unboundTx)
  }

  release(finalizedTx: string): Promise<void> {
    return releaseFinalizedTransaction(this.requireKeys().facade, finalizedTx)
  }

  private requireKeys(): { facade: WalletFacade; keys: AccountKeys } {
    this.assertActive()
    const { facade, keys } = this
    if (!facade || !keys) throw new Error(SYNCHRONISING)
    return { facade, keys }
  }

  get unshieldedPublicKey(): ReturnType<AccountKeys['unshieldedKeystore']['getPublicKey']> {
    this.assertActive()
    if (!this.keys) throw new Error(SYNCHRONISING)
    return this.keys.unshieldedKeystore.getPublicKey()
  }

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
  getAvailableUnshieldedBalances(): Promise<Record<string, bigint>> {
    return this.readState((state) => state.unshielded.balances)
  }
  getPendingUnshieldedBalances(): Promise<Record<string, bigint>> {
    return this.readState((state) =>
      state.unshielded.capabilities.coinsAndBalances.getPendingBalances(state.unshielded.state),
    )
  }
  getDustBalance(): Promise<bigint> {
    return this.readState((state) => state.dust.balance(new Date()))
  }
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
