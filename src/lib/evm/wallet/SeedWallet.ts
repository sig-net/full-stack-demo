import {
  createWalletClient,
  hexToBytes,
  http,
  type Chain,
  type PublicClient,
} from 'viem';
import { HDKey, hdKeyToAccount } from 'viem/accounts';
import type { Wallet, Erc20Transfer } from './Wallet';
import { transferErc20 } from '../erc20-transfer';

export class SeedWallet implements Wallet {
  readonly kind = 'seed';
  readonly name = 'Seed wallet';
  readonly iconUrl = undefined;
  readonly sessionId = crypto.randomUUID();
  private active = true;
  private clientValue?: Wallet['client'];

  constructor(
    readonly chain: Chain,
    readonly publicClient: PublicClient,
    private readonly rpcUrl: string,
    private seed: string,
    readonly explorerUrl?: string,
    private readonly verifyNetwork?: () => Promise<void>,
  ) {}

  async connect() {
    this.assertActive();
    if (this.clientValue) return;
    const seed = this.seed.trim().replace(/^0x/i, '');
    this.seed = '';
    if (!/^(?:[0-9a-fA-F]{2}){16,64}$/.test(seed))
      throw new Error('Enter a hexadecimal EVM seed of 16–64 bytes.');
    const bytes = hexToBytes(`0x${seed}`);
    try {
      const account = hdKeyToAccount(HDKey.fromMasterSeed(bytes));
      this.clientValue = createWalletClient({
        account,
        chain: this.chain,
        transport: http(this.rpcUrl),
      });
    } finally {
      bytes.fill(0);
    }
    await this.verify();
  }

  assertActive() {
    if (!this.active)
      throw new Error('EVM wallet session changed. Connect again.');
  }
  get client() {
    this.assertActive();
    if (!this.clientValue) throw new Error('Connect an EVM wallet first.');
    return this.clientValue;
  }
  get account() {
    return this.client.account.address;
  }
  get id() {
    return this.account;
  }
  get accountDetail() {
    return this.account;
  }
  async verify() {
    this.assertActive();
    const chainId = await this.publicClient.getChainId();
    this.assertActive();
    await this.verifyNetwork?.();
    this.assertActive();
    if (chainId !== this.chain.id)
      throw new Error(`EVM RPC must use chain ${this.chain.id}.`);
  }
  transferErc20(input: Erc20Transfer) {
    return transferErc20(this, input);
  }
  disconnect() {
    this.active = false;
    this.seed = '';
    this.clientValue = undefined;
  }
}
