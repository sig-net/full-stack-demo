import type { WalletMetadata } from '@/lib/wallet-metadata';
import type { MidnightNodeConfig } from '@/lib/config/midnight';
import type {
  MidnightProvider,
  WalletProvider,
} from '@midnight-ntwrk/midnight-js/types';

export type WalletTransactions = MidnightProvider & WalletProvider;

export interface Wallet extends WalletMetadata {
  readonly transactions?: WalletTransactions;
  readonly transactionUnavailable?: string;
  readonly fundingUnavailable?: string;
  readonly recoveryUnavailable?: string;
  readonly reportedProofServerUrl?: string;
  readonly configuration?: MidnightNodeConfig;
  readonly shieldedAddress: string;
  readonly unshieldedAddress: string;
  readonly unshieldedPublicKey?: import('@midnightntwrk/ledger-v9').SignatureVerifyingKey;
  ensureFeeReady?(minimumDust: bigint): Promise<void>;
  getShieldedBalances(): Promise<Record<string, bigint>>;
  getUnshieldedBalances(): Promise<Record<string, bigint>>;
  getDustBalance(): Promise<bigint>;
  disconnect(): Promise<void>;
}
