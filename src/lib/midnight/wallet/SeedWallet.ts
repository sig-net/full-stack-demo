import { setNetworkId } from "@midnight-ntwrk/midnight-js/network-id";
import { MidnightBech32m } from "@midnightntwrk/wallet-sdk-address-format";

import type { MidnightNodeConfig } from "@/lib/config/midnight";

import {
  type AccountKeys,
  createWalletAndMidnightProvider,
  deriveAccountKeys,
  initialiseWalletFacade,
  type WalletFacade,
} from "../seedlib";
import type { Wallet, WalletTransactions } from "./Wallet";

type State = Awaited<ReturnType<WalletFacade["waitForSyncedState"]>>;

/** Owns seed-derived keys, synchronisation and registration for one disposable wallet session. */
export class SeedWallet implements Wallet {
  readonly kind = "seed";
  readonly name = "Seed wallet";
  readonly iconUrl = undefined;
  /** @inheritdoc */
  get id(): string {
    return this.shieldedAddress;
  }
  /** @inheritdoc */
  get accountDetail(): string {
    return this.shieldedAddress;
  }
  /** @inheritdoc */
  get transactions(): WalletTransactions {
    return this;
  }
  private facade?: WalletFacade;
  private provider?: ReturnType<typeof createWalletAndMidnightProvider>;
  private latestState?: State;
  private subscription?: ReturnType<ReturnType<WalletFacade["state"]>["subscribe"]>;
  private work?: Promise<void>;
  private initialising?: Promise<void>;
  private stopping?: Promise<void>;
  private stopped = false;
  private cancel?: () => void;
  private address = "";
  private keys?: AccountKeys;
  private funding?: Promise<void>;

  /**
   * Captures startup inputs until explicit initialisation consumes the seed.
   *
   * @param config - Validated wallet endpoints and network.
   * @param seed - Transient hex seed cleared after derivation or disconnect.
   */
  constructor(
    private readonly config: MidnightNodeConfig,
    private seed: string,
  ) {}

  /**
   * Coalesces concurrent initialisation while allowing disconnect to reject pending callers.
   *
   * @param onProgress - Receives synchronisation progress for this session.
   * @returns Completion once addresses and balances have synchronised.
   * @throws {Error} If seed derivation, synchronisation or ownership fails.
   */
  initialise(onProgress: (status: string) => void = () => undefined): Promise<void> {
    if (this.stopped) return Promise.reject(new Error("Wallet disconnected."));
    if (this.initialising) return this.initialising;
    const cancelled = new Promise<never>((_resolve, reject) => {
      this.cancel = () => {
        reject(new Error("Wallet disconnected."));
      };
    });
    this.work = this.start(onProgress);
    this.initialising = Promise.race([this.work, cancelled]);
    return this.initialising;
  }

  private assertActive(): void {
    if (this.stopped) throw new Error("Wallet disconnected.");
  }

  private async start(onProgress: (status: string) => void): Promise<void> {
    try {
      setNetworkId(this.config.networkId);
      const keys = deriveAccountKeys(this.seed, this.config.networkId);
      this.keys = keys;
      this.seed = "";
      const facade = await initialiseWalletFacade(keys, this.config);
      this.facade = facade;
      this.assertActive();
      await facade.start(keys.shieldedSecretKeys, keys.dustSecretKey);
      this.assertActive();
      this.provider = createWalletAndMidnightProvider(facade, keys);
      onProgress("connecting to indexer…");
      await new Promise<void>((resolve, reject) => {
        this.subscription = facade.state().subscribe({
          next: (state) => {
            if (this.stopped) return;
            this.latestState = state;
            const progress = state.shielded.progress;
            if (state.isSynced) {
              onProgress("synced");
              resolve();
            } else {
              onProgress(
                progress.isConnected && progress.appliedIndex > 0n
                  ? `syncing (${progress.appliedIndex.toString()} updates)`
                  : "connecting to indexer…",
              );
            }
          },
          error: reject,
          complete: () => {
            reject(new Error("Wallet synchronisation ended."));
          },
        });
        const cancel = this.cancel;
        this.cancel = () => {
          cancel?.();
          reject(new Error("Wallet disconnected."));
        };
      });
      this.assertActive();
      this.address = MidnightBech32m.encode(
        this.config.networkId,
        this.state().shielded.address,
      ).toString();
    } catch (error) {
      this.stopped = true;
      this.seed = "";
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
    this.address = "";
    if (!this.facade) return Promise.resolve();
    this.stopping ??= this.facade.stop();
    return this.stopping;
  }

  /** @inheritdoc */
  disconnect(): Promise<void> {
    this.stopped = true;
    this.seed = "";
    this.cancel?.();
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.provider = undefined;
    this.latestState = undefined;
    this.keys = undefined;
    this.address = "";
    // A start already in flight can open connections after stop, so teardown awaits it.
    return (this.work ?? Promise.resolve()).catch(() => undefined).then(() => this.stopFacade());
  }

  private requireProvider(): ReturnType<typeof createWalletAndMidnightProvider> {
    this.assertActive();
    if (!this.provider) throw new Error("Wallet is still synchronising.");
    return this.provider;
  }

  /** @inheritdoc */
  get shieldedAddress(): string {
    this.assertActive();
    return this.address;
  }
  getCoinPublicKey: WalletTransactions["getCoinPublicKey"] = () =>
    this.requireProvider().getCoinPublicKey();
  getEncryptionPublicKey: WalletTransactions["getEncryptionPublicKey"] = () =>
    this.requireProvider().getEncryptionPublicKey();
  balanceTx: WalletTransactions["balanceTx"] = (tx, ttl) =>
    this.requireProvider().balanceTx(tx, ttl);
  submitTx: WalletTransactions["submitTx"] = (tx) => this.requireProvider().submitTx(tx);

  private state(): State {
    this.assertActive();
    if (!this.latestState) throw new Error("Wallet is still synchronising.");
    return this.latestState;
  }

  /** @inheritdoc */
  get unshieldedAddress(): string {
    this.assertActive();
    if (!this.keys) throw new Error("Wallet is still synchronising.");
    return this.keys.unshieldedKeystore.getBech32Address().toString();
  }

  /** @inheritdoc */
  get unshieldedPublicKey(): ReturnType<AccountKeys["unshieldedKeystore"]["getPublicKey"]> {
    this.assertActive();
    if (!this.keys) throw new Error("Wallet is still synchronising.");
    return this.keys.unshieldedKeystore.getPublicKey();
  }

  /** @inheritdoc */
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
    if (!facade || !keys) throw new Error("Wallet is still synchronising.");
    const deadline = Date.now() + 10 * 60_000;
    let registered = false;
    while (Date.now() < deadline) {
      this.assertActive();
      const state = this.state();
      const coins = state.unshielded.availableCoins.filter(
        (coin) => !coin.meta.registeredForDustGeneration,
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
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
    throw new Error("DUST is still below the transaction threshold. Retry readiness.");
  }

  /** @inheritdoc */
  getShieldedBalances(): Promise<Record<string, bigint>> {
    return this.readState((state) =>
      state.shielded.capabilities.coinsAndBalances.getTotalBalances(state.shielded.state),
    );
  }
  /** @inheritdoc */
  getUnshieldedBalances(): Promise<Record<string, bigint>> {
    return this.readState((state) => state.unshielded.balances);
  }
  /** @inheritdoc */
  getDustBalance(): Promise<bigint> {
    return this.readState((state) => state.dust.balance(new Date()));
  }

  private readState<Result>(read: (state: State) => Result): Promise<Result> {
    return new Promise((resolve) => {
      resolve(read(this.state()));
    });
  }
}
