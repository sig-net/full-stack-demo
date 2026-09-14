import type { Chain, PublicClient } from "viem";
import {
  type Address,
  createWalletClient,
  custom,
  type EIP1193Provider,
  getAddress,
  hexToNumber,
  numberToHex,
} from "viem";
import { z } from "zod";

import { transferErc20 } from "../erc20-transfer";
import type { Erc20Transfer, Wallet } from "./Wallet";

/** EIP-6963 metadata paired with the validated extension provider object. */
export interface BrowserWalletChoice {
  id: string;
  name: string;
  provider: EIP1193Provider;
  iconUrl?: string;
}

const announcedProvider = z.object({
  info: z.object({
    uuid: z.string(),
    name: z.string(),
    icon: z
      .unknown()
      .optional()
      .transform((value) => (typeof value === "string" ? value : undefined)),
  }),
  provider: z.custom<EIP1193Provider>(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      "request" in value &&
      typeof value.request === "function" &&
      "on" in value &&
      typeof value.on === "function" &&
      "removeListener" in value &&
      typeof value.removeListener === "function",
  ),
});

/**
 * Collects late extension announcements and replaces metadata for an existing provider UUID.
 *
 * @param publish - Receives each complete discovered-provider list.
 * @returns Cleanup for the exact listener installed by this subscription.
 */
export function discoverBrowserWallets(
  publish: (choices: BrowserWalletChoice[]) => void,
): () => void {
  const choices = new Map<string, BrowserWalletChoice>();
  const announce = (event: Event): void => {
    const detail: unknown = "detail" in event ? event.detail : undefined;
    const parsed = announcedProvider.safeParse(detail);
    if (!parsed.success) return;
    const { info, provider } = parsed.data;
    choices.set(info.uuid, {
      id: info.uuid,
      name: info.name,
      iconUrl: info.icon,
      provider,
    });
    publish([...choices.values()]);
  };
  window.addEventListener("eip6963:announceProvider", announce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  return () => {
    window.removeEventListener("eip6963:announceProvider", announce);
  };
}

/** Owns extension listeners and checks the captured account before each signing operation. */
export class BrowserWallet implements Wallet {
  readonly kind = "browser";
  /** @inheritdoc */
  get name(): string {
    return this.choice.name;
  }
  /** @inheritdoc */
  get iconUrl(): string | undefined {
    return this.choice.iconUrl;
  }
  /** @inheritdoc */
  get id(): Address {
    return this.account;
  }
  /** @inheritdoc */
  get accountDetail(): Address {
    return this.account;
  }
  readonly sessionId = crypto.randomUUID();
  private active = true;
  private accountValue: Address | null = null;
  private pending: Promise<void> | null = null;
  private switching = false;
  private readonly accountChanged = (): void => {
    if (this.accountValue) this.invalidate();
  };
  private readonly chainChanged = (): void => {
    if (!this.switching) this.invalidate();
  };
  private readonly providerDisconnected = (): void => {
    this.invalidate();
  };

  /**
   * Attaches invalidation listeners before requesting extension access.
   *
   * @param chain - Chain captured for the signing client.
   * @param publicClient - App RPC used to verify balances and mined receipts.
   * @param choice - Provider object selected from extension discovery.
   * @param onInvalidated - Notifies the connection owner when this session becomes unusable.
   * @param verifyNetwork - Optional deployment-specific fork check.
   * @param explorerUrl - Captured explorer origin for submitted transaction metadata.
   * @param verifyRpcChain - Query the app RPC for local or explicitly overridden chains.
   */
  constructor(
    readonly chain: Chain,
    readonly publicClient: PublicClient,
    readonly choice: BrowserWalletChoice,
    private readonly onInvalidated: (reason?: Error) => void,
    private readonly verifyNetwork?: () => Promise<void>,
    readonly explorerUrl?: string,
    private readonly verifyRpcChain = true,
  ) {
    choice.provider.on("accountsChanged", this.accountChanged);
    choice.provider.on("chainChanged", this.chainChanged);
    choice.provider.on("disconnect", this.providerDisconnected);
  }

  private invalidate(reason?: Error): void {
    this.disconnect();
    this.onInvalidated(reason);
  }
  /** @inheritdoc */
  assertActive(): void {
    if (!this.active) throw new Error("EVM wallet session changed. Connect again.");
  }
  /** @inheritdoc */
  get account(): Address {
    this.assertActive();
    if (!this.accountValue) throw new Error("Connect an EVM wallet first.");
    return this.accountValue;
  }
  /** @inheritdoc */
  get client(): Wallet["client"] {
    return createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: custom(this.choice.provider),
    });
  }

  /** @inheritdoc */
  connect(): Promise<void> {
    this.assertActive();
    if (this.accountValue) return Promise.resolve();
    this.pending ??= this.performConnect().catch((error: unknown) => {
      this.disconnect();
      throw error;
    });
    return this.pending;
  }

  private async performConnect(): Promise<void> {
    const provider = this.choice.provider;
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    this.assertActive();
    if (!accounts[0]) throw new Error("The EVM wallet returned no accounts.");
    this.accountValue = getAddress(accounts[0]);
    const chain = hexToNumber(await provider.request({ method: "eth_chainId" }));
    this.assertActive();
    if (chain !== this.chain.id) {
      this.switching = true;
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: numberToHex(this.chain.id) }],
        });
      } finally {
        this.switching = false;
      }
    }
    await this.verify();
  }

  /** @inheritdoc */
  async verify(): Promise<void> {
    this.assertActive();
    const account = this.account;
    const providerChain = hexToNumber(
      await this.choice.provider.request({ method: "eth_chainId" }),
    );
    this.assertActive();
    const accounts = await this.choice.provider.request({
      method: "eth_accounts",
    });
    this.assertActive();
    if (providerChain !== this.chain.id) {
      const failure = new Error(
        `Switch the EVM wallet to ${this.chain.name} (chain ${this.chain.id.toString()}) and connect again.`,
      );
      this.invalidate(failure);
      throw failure;
    }
    try {
      if (this.verifyRpcChain) {
        const rpcChain = await this.publicClient.getChainId();
        this.assertActive();
        if (rpcChain !== this.chain.id)
          throw new Error(
            `The configured EVM RPC reports chain ${rpcChain.toString()}. Select an RPC for chain ${this.chain.id.toString()} and reconnect.`,
          );
      }
      await this.verifyNetwork?.();
      this.assertActive();
    } catch (failure) {
      const error =
        failure instanceof Error ? failure : new Error("EVM network verification failed.");
      this.invalidate(error);
      throw error;
    }
    if (!accounts[0] || getAddress(accounts[0]) !== account) {
      const failure = new Error("EVM account changed. Connect again.");
      this.invalidate(failure);
      throw failure;
    }
  }

  /** @inheritdoc */
  transferErc20(input: Erc20Transfer): ReturnType<Wallet["transferErc20"]> {
    return transferErc20(this, input);
  }

  /** @inheritdoc */
  disconnect(): void {
    if (!this.active) return;
    this.active = false;
    this.accountValue = null;
    this.choice.provider.removeListener("accountsChanged", this.accountChanged);
    this.choice.provider.removeListener("chainChanged", this.chainChanged);
    this.choice.provider.removeListener("disconnect", this.providerDisconnected);
  }
}
