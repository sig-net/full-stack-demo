import type {
  MidnightProvider,
  WalletProvider,
} from '@midnight-ntwrk/midnight-js/types';

export interface Wallet extends MidnightProvider, WalletProvider {
  readonly shieldedAddress: string;
  readonly unshieldedAddress: string;
  readonly unshieldedPublicKey: import('@midnightntwrk/ledger-v9').SignatureVerifyingKey;
  ensureFeeReady(minimumDust: bigint): Promise<void>;
  /** Includes pending change from in-flight spends. */
  getShieldedBalances(): Promise<Record<string, bigint>>;
  getUnshieldedBalances(): Promise<Record<string, bigint>>;
  getDustBalance(): Promise<bigint>;
  disconnect(): Promise<void>;
}
