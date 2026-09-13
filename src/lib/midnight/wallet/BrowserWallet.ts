import type { ConnectedAPI, InitialAPI } from "@midnight-ntwrk/dapp-connector-api";
import { setNetworkId } from "@midnight-ntwrk/midnight-js/network-id";
import { Transaction } from "@midnightntwrk/ledger-v9";
import {
  MidnightBech32m,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from "@midnightntwrk/wallet-sdk-address-format";
import { z } from "zod";

import { createMidnightChainConfig, type MidnightNodeConfig } from "@/lib/config/midnight";

import type { Wallet, WalletTransactions } from "./Wallet";

/** Injected connector identity and its protocol-defined connection capability. */
export type BrowserWalletChoice = Omit<InitialAPI, "connect"> & {
  key: string;
  connector: InitialAPI;
};

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
  readonly fundingUnavailable =
    "This connector does not expose an unshielded public key or DUST registration. Fund and register NIGHT in the extension.";
  readonly recoveryUnavailable =
    "Resynchronise the browser wallet in the extension, then reconnect it.";
  private active = true;
  private api?: ConnectedAPI;
  private pending?: Promise<void>;
  private addresses?: Awaited<ReturnType<ConnectedAPI["getShieldedAddresses"]>>;
  private unshielded = "";
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
    return this.addresses?.shieldedAddress ?? "";
  }
  /** @inheritdoc */
  get unshieldedAddress(): string {
    this.assertActive();
    return this.unshielded;
  }
  private assertActive(): void {
    if (!this.active) throw new Error("Midnight wallet session changed. Connect again.");
  }
  /**
   * Coalesces extension approval and validates reported network and transaction capabilities.
   *
   * @returns Completion after addresses and available capabilities are captured.
   * @throws {Error} If approval, network validation or session ownership fails.
   */
  connect(): Promise<void> {
    this.assertActive();
    this.pending ??= this.start().catch((error: unknown) => {
      void this.disconnect();
      throw error;
    });
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
    const [addresses, unshielded] = await Promise.all([
      api.getShieldedAddresses(),
      api.getUnshieldedAddress(),
    ]);
    this.assertActive();
    setNetworkId(configuration.networkId);
    this.addresses = addresses;
    this.unshielded = unshielded.unshieldedAddress;
    const coinKey = ShieldedCoinPublicKey.codec
      .decode(configuration.networkId, MidnightBech32m.parse(addresses.shieldedCoinPublicKey))
      .toHexString();
    const encryptionKey = ShieldedEncryptionPublicKey.codec
      .decode(configuration.networkId, MidnightBech32m.parse(addresses.shieldedEncryptionPublicKey))
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
    this.addresses = undefined;
    this.unshielded = "";
    this.config = undefined;
    this.transactionProvider = undefined;
    return Promise.resolve();
  }
}
