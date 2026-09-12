import { setNetworkId } from '@midnight-ntwrk/midnight-js/network-id';
import { MidnightBech32m } from '@midnightntwrk/wallet-sdk-address-format';
import type { MidnightNodeConfig } from '@/lib/config/midnight';
import {
  deriveAccountKeys,
  initialiseWalletFacade,
  createWalletAndMidnightProvider,
  type WalletFacade,
  type AccountKeys,
} from '../seedlib';
import type { Wallet } from './Wallet';

type State = Awaited<ReturnType<WalletFacade['waitForSyncedState']>>;

export class SeedWallet implements Wallet {
  private facade?: WalletFacade;
  private provider?: ReturnType<typeof createWalletAndMidnightProvider>;
  private latestState?: State;
  private subscription?: ReturnType<
    ReturnType<WalletFacade['state']>['subscribe']
  >;
  private work?: Promise<void>;
  private initialising?: Promise<void>;
  private stopping?: Promise<void>;
  private stopped = false;
  private cancel?: () => void;
  private address = '';
  private keys?: AccountKeys;
  private funding?: Promise<void>;

  constructor(
    private readonly config: MidnightNodeConfig,
    private seed: string,
  ) {}

  initialise(onProgress: (status: string) => void = () => {}): Promise<void> {
    if (this.stopped) return Promise.reject(new Error('Wallet disconnected.'));
    if (this.initialising) return this.initialising;
    const cancelled = new Promise<never>((_resolve, reject) => {
      this.cancel = () => reject(new Error('Wallet disconnected.'));
    });
    this.work = this.start(onProgress);
    this.initialising = Promise.race([this.work, cancelled]);
    return this.initialising;
  }

  private assertActive() {
    if (this.stopped) throw new Error('Wallet disconnected.');
  }

  private async start(onProgress: (status: string) => void) {
    try {
      setNetworkId(this.config.networkId);
      const keys = deriveAccountKeys(this.seed, this.config.networkId);
      this.keys = keys;
      this.seed = '';
      const facade = await initialiseWalletFacade(keys, this.config);
      this.facade = facade;
      this.assertActive();
      await facade.start(keys.shieldedSecretKeys, keys.dustSecretKey);
      this.assertActive();
      this.provider = createWalletAndMidnightProvider(facade, keys);
      onProgress('connecting to indexer…');
      await new Promise<void>((resolve, reject) => {
        this.subscription = facade.state().subscribe({
          next: state => {
            if (this.stopped) return;
            this.latestState = state;
            const progress = state.shielded.progress;
            if (state.isSynced) {
              onProgress('synced');
              resolve();
            } else {
              onProgress(
                progress.isConnected && progress.appliedIndex > 0n
                  ? `syncing (${progress.appliedIndex} updates)`
                  : 'connecting to indexer…',
              );
            }
          },
          error: reject,
          complete: () => reject(new Error('Wallet synchronisation ended.')),
        });
        const cancel = this.cancel;
        this.cancel = () => {
          cancel?.();
          reject(new Error('Wallet disconnected.'));
        };
      });
      this.assertActive();
      this.address = MidnightBech32m.encode(
        this.config.networkId,
        this.latestState!.shielded.address,
      ).toString();
    } catch (error) {
      this.stopped = true;
      this.seed = '';
      await this.stopFacade();
      throw error;
    }
  }

  private stopFacade(): Promise<void> {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.provider = undefined;
    this.latestState = undefined;
    this.keys = undefined;
    this.address = '';
    if (!this.facade) return Promise.resolve();
    this.stopping ??= this.facade.stop();
    return this.stopping;
  }

  disconnect(): Promise<void> {
    this.stopped = true;
    this.seed = '';
    this.cancel?.();
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.provider = undefined;
    this.latestState = undefined;
    this.keys = undefined;
    this.address = '';
    // A start already in flight can open connections after stop, so teardown awaits it.
    return (this.work ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.stopFacade());
  }

  private requireProvider() {
    this.assertActive();
    if (!this.provider) throw new Error('Wallet is still synchronising.');
    return this.provider;
  }

  get shieldedAddress() {
    this.assertActive();
    return this.address;
  }
  getCoinPublicKey: Wallet['getCoinPublicKey'] = () =>
    this.requireProvider().getCoinPublicKey();
  getEncryptionPublicKey: Wallet['getEncryptionPublicKey'] = () =>
    this.requireProvider().getEncryptionPublicKey();
  balanceTx: Wallet['balanceTx'] = (tx, ttl) =>
    this.requireProvider().balanceTx(tx, ttl);
  submitTx: Wallet['submitTx'] = tx => this.requireProvider().submitTx(tx);

  private state(): State {
    this.assertActive();
    if (!this.latestState) throw new Error('Wallet is still synchronising.');
    return this.latestState;
  }

  get unshieldedAddress(): string {
    this.assertActive();
    if (!this.keys) throw new Error('Wallet is still synchronising.');
    return this.keys.unshieldedKeystore.getBech32Address().toString();
  }

  get unshieldedPublicKey() {
    this.assertActive();
    if (!this.keys) throw new Error('Wallet is still synchronising.');
    return this.keys.unshieldedKeystore.getPublicKey();
  }

  ensureFeeReady(minimumDust: bigint): Promise<void> {
    this.assertActive();
    this.funding ??= this.registerAndWait(minimumDust).finally(() => {
      this.funding = undefined;
    });
    return this.funding;
  }

  private async registerAndWait(minimumDust: bigint): Promise<void> {
    const facade = this.facade;
    const keys = this.keys;
    if (!facade || !keys) throw new Error('Wallet is still synchronising.');
    const deadline = Date.now() + 10 * 60_000;
    let registered = false;
    while (Date.now() < deadline) {
      this.assertActive();
      const state = this.state();
      const coins = state.unshielded.availableCoins.filter(
        coin => !coin.meta.registeredForDustGeneration,
      );
      if (coins.length && !registered) {
        // The deploy SDK exports registration through its Node entry. Replace this
        // browser adaptation when it exports a browser-safe registration entry.
        const estimate = await facade.estimateRegistration(coins);
        this.assertActive();
        await facade.waitForGeneratedDust(coins, estimate.fee, {
          timeoutMs: 300_000,
        });
        this.assertActive();
        const recipe = await facade.registerNightUtxosForDustGeneration(
          coins,
          keys.unshieldedKeystore.getPublicKey(),
          keys.unshieldedKeystore.signDataAsync,
        );
        this.assertActive();
        const transaction = await facade.finalizeRecipe(recipe);
        this.assertActive();
        await facade.submitTransaction(transaction);
        registered = true;
        this.assertActive();
      }
      if (state.dust.balance(new Date()) >= minimumDust) return;
      await new Promise(resolve => setTimeout(resolve, 3_000));
    }
    throw new Error(
      'DUST is still below the transaction threshold. Retry readiness.',
    );
  }

  async getShieldedBalances(): Promise<Record<string, bigint>> {
    const shielded = this.state().shielded;
    return shielded.capabilities.coinsAndBalances.getTotalBalances(
      shielded.state,
    );
  }
  async getUnshieldedBalances(): Promise<Record<string, bigint>> {
    return this.state().unshielded.balances;
  }
  async getDustBalance(): Promise<bigint> {
    return this.state().dust.balance(new Date());
  }
}
