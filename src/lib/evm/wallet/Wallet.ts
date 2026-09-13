import type { WalletMetadata } from '@/lib/wallet-metadata';
import type {
  Account,
  Address,
  Chain,
  Hash,
  PublicClient,
  Transport,
  WalletClient,
} from 'viem';

export interface Erc20Transfer {
  token: Address;
  destination: Address;
  units: bigint;
  beforeSubmit?: () => void;
  submitted: (hash: Hash) => void;
}

export interface Wallet extends WalletMetadata {
  readonly sessionId: string;
  readonly account: Address;
  readonly chain: Chain;
  readonly publicClient: PublicClient;
  readonly client: WalletClient<Transport, Chain, Account>;
  readonly explorerUrl?: string;
  connect(): Promise<void>;
  assertActive(): void;
  verify(): Promise<void>;
  transferErc20(input: Erc20Transfer): Promise<{ hash: Hash; units: bigint }>;
  disconnect(): void;
}

export interface WalletConnection {
  key: unknown;
  create: (onInvalidated: (reason?: Error) => void) => Wallet;
}
