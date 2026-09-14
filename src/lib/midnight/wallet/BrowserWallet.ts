import type { ConnectedAPI, InitialAPI } from "@midnight-ntwrk/dapp-connector-api";
import { setNetworkId } from "@midnight-ntwrk/midnight-js/network-id";
import { Transaction } from "@midnightntwrk/ledger-v9";
import {
  DustAddress,
  MidnightBech32m,
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
  UnshieldedAddress,
} from "@midnightntwrk/wallet-sdk-address-format";
import { z } from "zod";

import { createMidnightChainConfig, type MidnightNodeConfig } from "@/lib/config/midnight";

import type { Wallet, WalletAddressSnapshot, WalletTransactions } from "./Wallet";

/** Injected connector identity and its protocol-defined connection capability. */
export type BrowserWalletChoice = Omit<InitialAPI, "connect"> & {
  key: string;
  connector: InitialAPI;
};

type ShieldedAddresses = Awaited<ReturnType<ConnectedAPI["getShieldedAddresses"]>>;
type AddressListener = (snapshot: WalletAddressSnapshot) => void;
type DustAddressCapability = Pick<ConnectedAPI, "getDustAddress">;

const injectedConnectorSchema = z.custom<InitialAPI>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    "connect" in value &&
    typeof value.connect === "function" &&
    "name" in value &&
    typeof value.name === "string" &&
    "apiVersion" in value &&
    typeof value.apiVersion === "string" &&
    "icon" in value &&
    typeof value.icon === "string" &&
    "rdns" in value &&
    typeof value.rdns === "string",
);

/**
 * Reads the injected connector registry without initiating extension access.
 *
 * @returns Connectors with validated discovery metadata and a connection method.
 */
export function discoverBrowserWallets(): BrowserWalletChoice[] {
  return Object.entries(window.midnight ?? {}).flatMap(([key, value]) => {
    const parsed = injectedConnectorSchema.safeParse(value);
    if (!parsed.success) return [];
    const connector = parsed.data;
    return [
      {
        key,
        connector,
        name: connector.name,
        icon: connector.icon,
        rdns: connector.rdns,
        apiVersion: connector.apiVersion,
      },
    ];
  });
}

/** Guards connector reads and transaction completion against the captured network and session. */
export class BrowserWallet implements Wallet {
  readonly kind = "browser";
  readonly registrationUnavailable =
    "This connector does not expose NIGHT registration. Register NIGHT in the wallet extension.";
  readonly recoveryUnavailable =
    "Resynchronise the browser wallet in the extension, then reconnect it.";
  private active = true;
  private api?: ConnectedAPI;
  private pending?: Promise<void>;
  private shieldedAddresses?: ShieldedAddresses;
  private unshielded = "";
  private dust = "";
  private dustUnavailable?: string;
  private addressListener?: AddressListener;
  private config?: MidnightNodeConfig;
  private transactionProvider?: WalletTransactions;
  private unsupported?: string;
  /**
   * Captures extension selection and the application network before requesting access.
   *
   * @param choice - Discovered connector and display metadata.
   * @param expected - Application configuration used to check the connector network.
   * @param onInvalidated - Notifies the owner when a connected session becomes unusable.
   */
  constructor(
    readonly choice: BrowserWalletChoice,
    private readonly expected: MidnightNodeConfig,
    private readonly onInvalidated: (error: Error) => void = () => undefined,
  ) {}
  /** @inheritdoc */
  get name(): string {
    return this.choice.name;
  }
  /** @inheritdoc */
  get iconUrl(): string {
    return this.choice.icon;
  }
  /** @inheritdoc */
  get id(): string {
    return this.shieldedAddress;
  }
  /** @inheritdoc */
  get accountDetail(): string {
    return this.shieldedAddress;
  }
  /** @inheritdoc */
  get configuration(): MidnightNodeConfig | undefined {
    return this.config;
  }
  /** @inheritdoc */
  get transactions(): WalletTransactions | undefined {
    return this.transactionProvider;
  }
  /** @inheritdoc */
  get transactionUnavailable(): string | undefined {
    return this.unsupported;
  }
  /** @inheritdoc */
  get shieldedAddress(): string {
    this.assertActive();
    return this.shieldedAddresses?.shieldedAddress ?? "";
  }
  /** @inheritdoc */
  get unshieldedAddress(): string {
    this.assertActive();
    return this.unshielded;
  }
  /** @inheritdoc */
  get dustAddress(): string | undefined {
    this.assertActive();
    return this.dust || undefined;
  }
  private assertActive(): void {
    if (!this.active) throw new Error("Midnight wallet session changed. Connect again.");
  }
  /**
   * Coalesces extension approval and validates reported network and transaction capabilities.
   *
   * @param onAddresses - Receives immutable cumulative address availability for this connection.
   * @returns Completion after addresses and available capabilities are captured.
   * @throws {Error} If approval, network validation or session ownership fails.
   */
  connect(onAddresses: AddressListener = () => undefined): Promise<void> {
    this.assertActive();
    if (!this.pending) {
      this.addressListener = onAddresses;
      this.pending = this.start().catch((error: unknown) => {
        void this.disconnect();
        throw error;
      });
    }
    return this.pending;
  }
  private async start(): Promise<void> {
    if (!this.choice.apiVersion.startsWith("4."))
      throw new Error(
        `Unsupported Midnight connector API ${this.choice.apiVersion}. Version 4 is required.`,
      );
    const api = await this.choice.connector.connect(this.expected.networkId);
    this.assertActive();
    this.api = api;
    const configuration = await api.getConfiguration();
    this.assertActive();
    if (configuration.networkId !== this.expected.networkId)
      throw new Error(
        `Switch ${this.name} to ${this.expected.networkId} and reconnect. The wallet reports ${configuration.networkId}.`,
      );
    this.config = createMidnightChainConfig({
      networkId: configuration.networkId,
      indexerUrl: configuration.indexerUri,
      indexerWsUrl: configuration.indexerWsUri,
      nodeUrl: configuration.substrateNodeUri,
      proofServerUrl: this.expected.proofServerUrl,
    });
    await Promise.all([
      this.captureShieldedAddress(api, configuration.networkId),
      this.captureUnshieldedAddress(api, configuration.networkId),
      this.captureDustAddress(api, configuration.networkId),
    ]);
    this.assertActive();
    setNetworkId(configuration.networkId);
    const shieldedAddresses = this.shieldedAddresses;
    if (!shieldedAddresses) throw new Error("The connector did not provide a shielded address.");
    const coinKey = ShieldedCoinPublicKey.codec
      .decode(
        configuration.networkId,
        MidnightBech32m.parse(shieldedAddresses.shieldedCoinPublicKey),
      )
      .toHexString();
    const encryptionKey = ShieldedEncryptionPublicKey.codec
      .decode(
        configuration.networkId,
        MidnightBech32m.parse(shieldedAddresses.shieldedEncryptionPublicKey),
      )
      .toHexString();
    if (
      typeof api.balanceUnsealedTransaction !== "function" ||
      typeof api.submitTransaction !== "function"
    ) {
      this.unsupported =
        "Vault transactions require connector balanceUnsealedTransaction and submitTransaction methods.";
      return;
    }
    this.transactionProvider = {
      getCoinPublicKey: () => {
        this.assertActive();
        return coinKey;
      },
      getEncryptionPublicKey: () => {
        this.assertActive();
        return encryptionKey;
      },
      balanceTx: async (tx) => {
        const api = await this.requireApi();
        const balanced = await api.balanceUnsealedTransaction(
          Buffer.from(tx.serialize()).toString("hex"),
        );
        this.assertActive();
        if (!/^(?:[0-9a-fA-F]{2})+$/.test(balanced.tx))
          throw new Error("The connector returned an invalid hexadecimal transaction.");
        return Transaction.deserialize(
          "signature",
          "proof",
          "binding",
          Buffer.from(balanced.tx, "hex"),
        );
      },
      submitTx: async (tx) => {
        const api = await this.requireApi();
        const id = tx.identifiers()[0];
        if (!id) throw new Error("The Midnight transaction has no identifier.");
        await api.submitTransaction(Buffer.from(tx.serialize()).toString("hex"));
        this.assertActive();
        return id;
      },
    };
  }
  private publishAddressSnapshot(networkId: MidnightNodeConfig["networkId"]): void {
    if (!this.active || !this.addressListener) return;
    this.addressListener(
      Object.freeze({
        networkId,
        ...(this.shieldedAddresses
          ? { shieldedAddress: this.shieldedAddresses.shieldedAddress }
          : {}),
        ...(this.unshielded ? { unshieldedAddress: this.unshielded } : {}),
        ...(this.dust ? { dustAddress: this.dust } : {}),
        ...(this.dustUnavailable ? { dustUnavailable: this.dustUnavailable } : {}),
      }),
    );
  }
  private clearAddressSnapshot(): void {
    const listener = this.addressListener;
    const networkId = this.config?.networkId;
    this.shieldedAddresses = undefined;
    this.unshielded = "";
    this.dust = "";
    this.dustUnavailable = undefined;
    this.addressListener = undefined;
    if (listener && networkId) listener(Object.freeze({ networkId }));
  }
  private async captureShieldedAddress(
    api: ConnectedAPI,
    networkId: MidnightNodeConfig["networkId"],
  ): Promise<void> {
    const shieldedAddresses = await api.getShieldedAddresses();
    const coinPublicKey = ShieldedCoinPublicKey.codec.decode(
      networkId,
      MidnightBech32m.parse(shieldedAddresses.shieldedCoinPublicKey),
    );
    const encryptionPublicKey = ShieldedEncryptionPublicKey.codec.decode(
      networkId,
      MidnightBech32m.parse(shieldedAddresses.shieldedEncryptionPublicKey),
    );
    const expectedAddress = MidnightBech32m.encode(
      networkId,
      new ShieldedAddress(coinPublicKey, encryptionPublicKey),
    ).toString();
    if (expectedAddress !== shieldedAddresses.shieldedAddress)
      throw new Error(
        "The connector returned shielded keys that do not match its shielded address.",
      );
    this.assertActive();
    this.shieldedAddresses = shieldedAddresses;
    this.publishAddressSnapshot(networkId);
  }
  private async captureUnshieldedAddress(
    api: ConnectedAPI,
    networkId: MidnightNodeConfig["networkId"],
  ): Promise<void> {
    const { unshieldedAddress } = await api.getUnshieldedAddress();
    MidnightBech32m.parse(unshieldedAddress).decode(UnshieldedAddress, networkId);
    this.assertActive();
    this.unshielded = unshieldedAddress;
    this.publishAddressSnapshot(networkId);
  }
  private async captureDustAddress(
    api: ConnectedAPI,
    networkId: MidnightNodeConfig["networkId"],
  ): Promise<void> {
    const getDustAddress = (api as Partial<DustAddressCapability>).getDustAddress;
    if (typeof getDustAddress !== "function") {
      this.assertActive();
      this.dustUnavailable = "This connector does not expose a DUST address.";
      this.publishAddressSnapshot(networkId);
      return;
    }
    try {
      const { dustAddress } = await getDustAddress.call(api);
      MidnightBech32m.parse(dustAddress).decode(DustAddress, networkId);
      this.assertActive();
      this.dust = dustAddress;
      this.dustUnavailable = undefined;
      this.publishAddressSnapshot(networkId);
    } catch {
      this.assertActive();
      this.dust = "";
      this.dustUnavailable = "This connector could not provide a valid DUST address.";
      this.publishAddressSnapshot(networkId);
    }
  }
  private async requireApi(): Promise<ConnectedAPI> {
    this.assertActive();
    const api = this.api;
    if (!api) throw new Error("Connect a Midnight browser wallet first.");
    const status = await api.getConnectionStatus();
    this.assertActive();
    if (status.status !== "connected" || status.networkId !== this.expected.networkId) {
      const error = new Error(
        "Midnight browser connection or network changed. Reconnect the wallet.",
      );
      await this.disconnect();
      this.onInvalidated(error);
      throw error;
    }
    return api;
  }
  /** @inheritdoc */
  async getShieldedBalances(): Promise<Record<string, bigint>> {
    const api = await this.requireApi();
    const result = await api.getShieldedBalances();
    this.assertActive();
    return result;
  }
  /** @inheritdoc */
  async getUnshieldedBalances(): Promise<Record<string, bigint>> {
    const api = await this.requireApi();
    const result = await api.getUnshieldedBalances();
    this.assertActive();
    return result;
  }
  /** @inheritdoc */
  async getDustBalance(): Promise<bigint> {
    const api = await this.requireApi();
    const result = await api.getDustBalance();
    this.assertActive();
    return result.balance;
  }
  /** @inheritdoc */
  disconnect(): Promise<void> {
    this.active = false;
    this.api = undefined;
    this.pending = undefined;
    this.clearAddressSnapshot();
    this.config = undefined;
    this.transactionProvider = undefined;
    return Promise.resolve();
  }
}
