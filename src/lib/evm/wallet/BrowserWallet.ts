import {
  createWalletClient,
  custom,
  getAddress,
  hexToNumber,
  numberToHex,
  type Address,
  type EIP1193Provider,
} from 'viem';
import type { Chain, PublicClient } from 'viem';
import type { Wallet, Erc20Transfer } from './Wallet';
import { transferErc20 } from '../erc20-transfer';

export interface BrowserWalletChoice {
  id: string;
  name: string;
  provider: EIP1193Provider;
  iconUrl?: string;
}

export function discoverBrowserWallets(
  publish: (choices: BrowserWalletChoice[]) => void,
): () => void {
  const choices = new Map<string, BrowserWalletChoice>();
  const announce = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (
      !detail ||
      typeof detail.info?.uuid !== 'string' ||
      typeof detail.info?.name !== 'string' ||
      typeof detail.provider?.request !== 'function' ||
      typeof detail.provider?.on !== 'function' ||
      typeof detail.provider?.removeListener !== 'function'
    )
      return;
    choices.set(detail.info.uuid, {
      id: detail.info.uuid,
      name: detail.info.name,
      iconUrl:
        typeof detail.info.icon === 'string' ? detail.info.icon : undefined,
      provider: detail.provider,
    });
    publish([...choices.values()]);
  };
  window.addEventListener('eip6963:announceProvider', announce);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  return () => window.removeEventListener('eip6963:announceProvider', announce);
}

export class BrowserWallet implements Wallet {
  readonly kind = 'browser';
  get name() {
    return this.choice.name;
  }
  get iconUrl() {
    return this.choice.iconUrl;
  }
  get id() {
    return this.account;
  }
  get accountDetail() {
    return this.account;
  }
  readonly sessionId = crypto.randomUUID();
  private active = true;
  private accountValue: Address | null = null;
  private pending: Promise<void> | null = null;
  private switching = false;
  private readonly accountChanged = () => {
    if (this.accountValue) this.invalidate();
  };
  private readonly chainChanged = () => {
    if (!this.switching) this.invalidate();
  };
  private readonly providerDisconnected = () => this.invalidate();

  constructor(
    readonly chain: Chain,
    readonly publicClient: PublicClient,
    readonly choice: BrowserWalletChoice,
    private readonly onInvalidated: (reason?: Error) => void,
    private readonly verifyNetwork?: () => Promise<void>,
    readonly explorerUrl?: string,
  ) {
    choice.provider.on('accountsChanged', this.accountChanged);
    choice.provider.on('chainChanged', this.chainChanged);
    choice.provider.on('disconnect', this.providerDisconnected);
  }

  private invalidate(reason?: Error) {
    this.disconnect();
    this.onInvalidated(reason);
  }
  assertActive() {
    if (!this.active)
      throw new Error('EVM wallet session changed. Connect again.');
  }
  get account(): Address {
    this.assertActive();
    if (!this.accountValue) throw new Error('Connect an EVM wallet first.');
    return this.accountValue;
  }
  get client() {
    return createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: custom(this.choice.provider),
    });
  }

  connect(): Promise<void> {
    this.assertActive();
    if (this.accountValue) return Promise.resolve();
    if (!this.pending)
      this.pending = this.performConnect().catch(error => {
        this.disconnect();
        throw error;
      });
    return this.pending;
  }

  private async performConnect() {
    const provider = this.choice.provider;
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    this.assertActive();
    if (!accounts[0]) throw new Error('The EVM wallet returned no accounts.');
    this.accountValue = getAddress(accounts[0]);
    const chain = hexToNumber(
      await provider.request({ method: 'eth_chainId' }),
    );
    this.assertActive();
    if (chain !== this.chain.id) {
      this.switching = true;
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: numberToHex(this.chain.id) }],
        });
      } finally {
        this.switching = false;
      }
    }
    await this.verify();
  }

  async verify() {
    this.assertActive();
    const account = this.account;
    const chain = hexToNumber(
      await this.choice.provider.request({ method: 'eth_chainId' }),
    );
    this.assertActive();
    const accounts = await this.choice.provider.request({
      method: 'eth_accounts',
    });
    this.assertActive();
    if (chain !== this.chain.id) {
      const failure = new Error(
        `Switch the EVM wallet to ${this.chain.name} (chain ${this.chain.id}) and connect again.`,
      );
      this.invalidate(failure);
      throw failure;
    }
    try {
      await this.verifyNetwork?.();
      this.assertActive();
    } catch (failure) {
      const error =
        failure instanceof Error
          ? failure
          : new Error('EVM network verification failed.');
      this.invalidate(error);
      throw error;
    }
    if (!accounts[0] || getAddress(accounts[0]) !== account) {
      const failure = new Error('EVM account changed. Connect again.');
      this.invalidate(failure);
      throw failure;
    }
  }

  transferErc20(input: Erc20Transfer) {
    return transferErc20(this, input);
  }

  disconnect() {
    if (!this.active) return;
    this.active = false;
    this.accountValue = null;
    this.choice.provider.removeListener('accountsChanged', this.accountChanged);
    this.choice.provider.removeListener('chainChanged', this.chainChanged);
    this.choice.provider.removeListener(
      'disconnect',
      this.providerDisconnected,
    );
  }
}
