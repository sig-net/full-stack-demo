import type { MidnightProvider, WalletProvider } from "@midnight-ntwrk/midnight-js/types";
import type { SignatureVerifyingKey } from "@midnightntwrk/ledger-v9";

import type { MidnightNodeConfig } from "@/lib/config/midnight";
import type { WalletMetadata } from "@/lib/wallet-metadata";

/** SDK signing and submission capabilities supplied by a connected adapter. */
export type WalletTransactions = MidnightProvider & WalletProvider;

/** Session-bound wallet reads with explicit optional transaction, funding and recovery capabilities. */
export interface Wallet extends WalletMetadata {
  readonly transactions?: WalletTransactions;
  readonly transactionUnavailable?: string;
  readonly fundingUnavailable?: string;
  readonly recoveryUnavailable?: string;
  readonly reportedProofServerUrl?: string;
  readonly configuration?: MidnightNodeConfig;
  readonly shieldedAddress: string;
  readonly unshieldedAddress: string;
  readonly unshieldedPublicKey?: SignatureVerifyingKey;
  /**
   * Prepares enough fee resources for the requested readiness threshold.
   *
   * @param minimumDust - Required DUST in ledger units.
   * @returns Completion once the captured wallet reaches the threshold.
   * @throws {Error} If readiness, registration or session ownership fails.
   */
  ensureFeeReady?(minimumDust: bigint): Promise<void>;
  /**
   * Reads shielded token balances for the active session.
   *
   * @returns Token-type balances in base units.
   */
  getShieldedBalances(): Promise<Record<string, bigint>>;
  /**
   * Reads unshielded token balances for the active session.
   *
   * @returns Token-type balances in base units.
   */
  getUnshieldedBalances(): Promise<Record<string, bigint>>;
  /**
   * Reads spendable DUST for the active session.
   *
   * @returns The current fee balance in ledger units.
   */
  getDustBalance(): Promise<bigint>;
  /**
   * Releases app-owned signing references and adapter resources.
   *
   * @returns Completion after owned transport teardown.
   */
  disconnect(): Promise<void>;
}
