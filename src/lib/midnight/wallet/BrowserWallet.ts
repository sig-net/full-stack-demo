import { setNetworkId } from '@midnight-ntwrk/midnight-js/network-id';
import type {
  InitialAPI,
  ConnectedAPI,
} from '@midnight-ntwrk/dapp-connector-api';
import { Transaction } from '@midnightntwrk/ledger-v9';
import {
  MidnightBech32m,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnightntwrk/wallet-sdk-address-format';
import {
  createMidnightChainConfig,
  type MidnightNodeConfig,
} from '@/lib/config/midnight';
import type { Wallet, WalletTransactions } from './Wallet';

export type BrowserWalletChoice = Omit<InitialAPI, 'connect'> & {
  key: string;
  connector: InitialAPI;
};

export function discoverBrowserWallets(): BrowserWalletChoice[] {
  return Object.entries(window.midnight ?? {}).flatMap(([key, connector]) =>
    connector &&
    typeof connector.connect === 'function' &&
    typeof connector.name === 'string' &&
    typeof connector.apiVersion === 'string'
      ? [
          {
            key,
            connector,
            name: connector.name,
            icon: connector.icon,
            rdns: connector.rdns,
            apiVersion: connector.apiVersion,
          },
        ]
      : [],
  );
}

export class BrowserWallet implements Wallet {
  readonly kind = 'browser';
  readonly fundingUnavailable =
    'This connector does not expose an unshielded public key or DUST registration. Fund and register NIGHT in the extension.';
  readonly recoveryUnavailable =
    'Resynchronise the browser wallet in the extension, then reconnect it.';
  private active = true;
  private api?: ConnectedAPI;
  private pending?: Promise<void>;
  private addresses?: Awaited<ReturnType<ConnectedAPI['getShieldedAddresses']>>;
  private unshielded = '';
  private config?: MidnightNodeConfig;
  private transactionProvider?: WalletTransactions;
  private unsupported?: string;
  constructor(
    readonly choice: BrowserWalletChoice,
    private readonly expected: MidnightNodeConfig,
    private readonly onInvalidated: (error: Error) => void = () => {},
  ) {}
  get name() {
    return this.choice.name;
  }
  get iconUrl() {
    return this.choice.icon;
  }
  get id() {
    return this.shieldedAddress;
  }
  get accountDetail() {
    return this.shieldedAddress;
  }
  get configuration() {
    return this.config;
  }
  get transactions() {
    return this.transactionProvider;
  }
  get transactionUnavailable() {
    return this.unsupported;
  }
  get shieldedAddress() {
    this.assertActive();
    return this.addresses?.shieldedAddress ?? '';
  }
  get unshieldedAddress() {
    this.assertActive();
    return this.unshielded;
  }
  private assertActive() {
    if (!this.active)
      throw new Error('Midnight wallet session changed. Connect again.');
  }
  connect() {
    this.assertActive();
    this.pending ??= this.start().catch(error => {
      void this.disconnect();
      throw error;
    });
    return this.pending;
  }
  private async start() {
    if (!/^4\./.test(this.choice.apiVersion))
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
      proofServerUrl:
        configuration.proverServerUri ?? this.expected.proofServerUrl,
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
      .decode(
        configuration.networkId,
        MidnightBech32m.parse(addresses.shieldedCoinPublicKey),
      )
      .toHexString();
    const encryptionKey = ShieldedEncryptionPublicKey.codec
      .decode(
        configuration.networkId,
        MidnightBech32m.parse(addresses.shieldedEncryptionPublicKey),
      )
      .toHexString();
    if (
      typeof api.balanceUnsealedTransaction !== 'function' ||
      typeof api.submitTransaction !== 'function'
    ) {
      this.unsupported =
        'Vault transactions require connector balanceUnsealedTransaction and submitTransaction methods.';
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
      balanceTx: async tx => {
        const api = await this.requireApi();
        const balanced = await api.balanceUnsealedTransaction(
          Buffer.from(tx.serialize()).toString('hex'),
        );
        this.assertActive();
        if (!/^(?:[0-9a-fA-F]{2})+$/.test(balanced.tx))
          throw new Error(
            'The connector returned an invalid hexadecimal transaction.',
          );
        return Transaction.deserialize(
          'signature',
          'proof',
          'binding',
          Buffer.from(balanced.tx, 'hex'),
        );
      },
      submitTx: async tx => {
        const api = await this.requireApi();
        const id = tx.identifiers()[0];
        if (!id) throw new Error('The Midnight transaction has no identifier.');
        await api.submitTransaction(
          Buffer.from(tx.serialize()).toString('hex'),
        );
        this.assertActive();
        return id;
      },
    };
  }
  private async requireApi() {
    this.assertActive();
    const api = this.api;
    if (!api) throw new Error('Connect a Midnight browser wallet first.');
    const status = await api.getConnectionStatus();
    this.assertActive();
    if (
      status.status !== 'connected' ||
      status.networkId !== this.expected.networkId
    ) {
      const error = new Error(
        'Midnight browser connection or network changed. Reconnect the wallet.',
      );
      await this.disconnect();
      this.onInvalidated(error);
      throw error;
    }
    return api;
  }
  async getShieldedBalances() {
    const api = await this.requireApi();
    const result = await api.getShieldedBalances();
    this.assertActive();
    return result;
  }
  async getUnshieldedBalances() {
    const api = await this.requireApi();
    const result = await api.getUnshieldedBalances();
    this.assertActive();
    return result;
  }
  async getDustBalance() {
    const api = await this.requireApi();
    const result = await api.getDustBalance();
    this.assertActive();
    return result.balance;
  }
  async disconnect() {
    this.active = false;
    this.api = undefined;
    this.pending = undefined;
    this.addresses = undefined;
    this.unshielded = '';
    this.config = undefined;
    this.transactionProvider = undefined;
  }
}
