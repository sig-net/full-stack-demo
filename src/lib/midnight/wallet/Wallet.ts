import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import type { MidnightProvider, WalletProvider } from "@midnight-ntwrk/midnight-js/types";
import type { SignatureVerifyingKey } from "@midnightntwrk/ledger-v9";

import type { MidnightNodeConfig, NetworkId } from "@/lib/config/midnight";
import type { WalletMetadata } from "@/lib/wallet-metadata";

/** SDK signing and submission capabilities supplied by a connected adapter. */
export type WalletTransactions = MidnightProvider & WalletProvider;

type ConnectorAddresses = Pick<
  Awaited<ReturnType<ConnectedAPI["getShieldedAddresses"]>>,
  "shieldedAddress"
> &
  Awaited<ReturnType<ConnectedAPI["getUnshieldedAddress"]>> &
  Awaited<ReturnType<ConnectedAPI["getDustAddress"]>>;

/** Public derivation results only. Availability does not establish wallet or balance readiness. */
export type WalletAddressSnapshot = Readonly<
  Partial<ConnectorAddresses> & {
    networkId: NetworkId;
    dustUnavailable?: string;
  }
>;

/** Session-bound wallet reads with explicit optional transaction, funding and recovery capabilities. */
export interface Wallet extends WalletMetadata {
  readonly transactions?: WalletTransactions;
  readonly transactionUnavailable?: string;
  readonly registrationUnavailable?: string;
  readonly recoveryUnavailable?: string;
  readonly reportedProofServerUrl?: string;
  readonly configuration?: MidnightNodeConfig;
  readonly shieldedAddress: string;
  readonly unshieldedAddress: string;
  readonly dustAddress?: string;
  readonly unshieldedPublicKey?: SignatureVerifyingKey;
  /**
   * Reads NIGHT that the connected wallet has not registered for DUST generation.
   *
   * @returns Available unregistered NIGHT in ledger units when the adapter can observe it.
   */
  getUnregisteredNightBalance?(): Promise<bigint>;
  /**
   * Registers the connected wallet's eligible NIGHT for DUST generation and waits for fees.
   *
   * @param minimumDust - Required DUST in ledger units.
   * @returns Completion once the captured wallet reaches the threshold.
   * @throws {Error} If readiness, registration or session ownership fails.
   */
  registerNightForDust?(minimumDust: bigint): Promise<void>;
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
