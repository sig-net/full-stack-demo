import { type Chain, createWalletClient, hexToBytes, http, type PublicClient } from "viem";
import { HDKey, hdKeyToAccount } from "viem/accounts";

import { transferErc20 } from "../erc20-transfer";
import type { Erc20Transfer, Wallet } from "./Wallet";

/** Keeps seed-derived signing material within a disposable page-memory session. */
export class SeedWallet implements Wallet {
  readonly kind = "seed";
  readonly name = "Seed wallet";
  readonly iconUrl = undefined;
  readonly sessionId = crypto.randomUUID();
  private active = true;
  private clientValue?: Wallet["client"];

  /**
   * Captures signing inputs until connection derives the account and clears the raw seed.
   *
   * @param chain - Chain used by the signing client.
   * @param publicClient - App RPC used for chain and receipt checks.
   * @param rpcUrl - HTTP endpoint used for signed transaction submission.
   * @param seed - Disposable hexadecimal seed supplied by the user.
   * @param explorerUrl - Captured explorer origin for transaction metadata.
   * @param verifyNetwork - Optional local-fork identity check.
   * @param verifyRpcChain - Query the app RPC for local or explicitly overridden chains.
   */
  constructor(
    readonly chain: Chain,
    readonly publicClient: PublicClient,
    private readonly rpcUrl: string,
    private seed: string,
    readonly explorerUrl?: string,
    private readonly verifyNetwork?: () => Promise<void>,
    private readonly verifyRpcChain = true,
  ) {}

  /** @inheritdoc */
  async connect(): Promise<void> {
    this.assertActive();
    if (this.clientValue) return;
    const seed = this.seed.trim().replace(/^0x/i, "");
    this.seed = "";
    if (!/^(?:[0-9a-fA-F]{2}){16,64}$/.test(seed))
      throw new Error("Enter a hexadecimal EVM seed of 16–64 bytes.");
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

  /** @inheritdoc */
  assertActive(): void {
    if (!this.active) throw new Error("EVM wallet session changed. Connect again.");
  }
  /** @inheritdoc */
  get client(): Wallet["client"] {
    this.assertActive();
    if (!this.clientValue) throw new Error("Connect an EVM wallet first.");
    return this.clientValue;
  }
  /** @inheritdoc */
  get account(): Wallet["account"] {
    return this.client.account.address;
  }
  /** @inheritdoc */
  get id(): Wallet["account"] {
    return this.account;
  }
  /** @inheritdoc */
  get accountDetail(): Wallet["account"] {
    return this.account;
  }
  /** @inheritdoc */
  async verify(): Promise<void> {
    this.assertActive();
    if (this.verifyRpcChain) {
      const chainId = await this.publicClient.getChainId();
      this.assertActive();
      if (chainId !== this.chain.id)
        throw new Error(`EVM RPC must use chain ${this.chain.id.toString()}.`);
    }
    await this.verifyNetwork?.();
    this.assertActive();
  }
  /** @inheritdoc */
  transferErc20(input: Erc20Transfer): ReturnType<Wallet["transferErc20"]> {
    return transferErc20(this, input);
  }
  /** @inheritdoc */
  disconnect(): void {
    this.active = false;
    this.seed = "";
    this.clientValue = undefined;
  }
}
