import type { Account, Address, Chain, Hash, PublicClient, Transport, WalletClient } from "viem";

import type { WalletMetadata } from "@/lib/wallet-metadata";

/** The exact transfer a mined receipt has to satisfy before it counts as confirmed. */
export interface Erc20TransferReceipt {
  token: Address;
  destination: Address;
  units: bigint;
}

/** Captured transfer inputs and callbacks that keep submitted hashes observable across session changes. */
export interface Erc20Transfer extends Erc20TransferReceipt {
  beforeSubmit?: () => void;
  submitted: (hash: Hash) => void;
}

/** A disposable signing session whose identity is distinct from its account and network. */
export interface Wallet extends WalletMetadata {
  readonly sessionId: string;
  readonly account: Address;
  readonly chain: Chain;
  readonly publicClient: PublicClient;
  readonly client: WalletClient<Transport, Chain, Account>;
  readonly explorerUrl?: string;
  /**
   * Acquires a signing account for this session.
   *
   * @returns Completion after network verification.
   * @throws {Error} If credentials, provider approval or network verification fail.
   */
  connect(): Promise<void>;
  /**
   * Rejects operations after this session is disposed.
   *
   * @throws {Error} If the session has been invalidated.
   */
  assertActive(): void;
  /**
   * Rechecks the account, chain and configured fork policy before signing.
   *
   * @returns Completion while the captured session remains valid.
   * @throws {Error} If the provider or session does not match its captured inputs.
   */
  verify(): Promise<void>;
  /**
   * Preserves receipt identity across transaction replacement and session changes.
   *
   * @param input - Captured token, recipient and exact base-unit amount.
   * @returns The verified mined hash and transferred units.
   * @throws {Error} If eligibility, signing, settlement or receipt identity checks fail.
   */
  transferErc20(input: Erc20Transfer): Promise<{ hash: Hash; units: bigint }>;
  /**
   * Establishes the outcome of an already submitted transfer without signing or sending anything.
   *
   * @param input - The submitted hash and the exact transfer its receipt has to satisfy.
   * @returns The mined hash and the transferred units once the receipt confirms this transfer.
   * @throws {Error} If the transaction is still pending, reverted or replaced.
   */
  recheckErc20Transfer(
    input: Erc20TransferReceipt & { hash: Hash },
  ): Promise<{ hash: Hash; units: bigint }>;
  /** Releases this session's listeners and app-owned signing references. */
  disconnect(): void;
}

/** A factory with a stable object identity used to coalesce duplicate connection attempts. */
export interface WalletConnection {
  key: object;
  create: (onInvalidated: (reason?: Error) => void) => Wallet;
}
