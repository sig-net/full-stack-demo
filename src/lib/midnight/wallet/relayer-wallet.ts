import type { MidnightProvider, WalletProvider } from '@midnight-ntwrk/midnight-js/types'

import type { WalletPublicKeys } from '@/lib/midnight/wallet/wallet'

/**
 * The backend's own Midnight wallet, which finalises and pays for relayer transactions. One
 * instance syncs per process: the start-up starts it once, and nothing finalises before then.
 */
export interface RelayerWallet {
  /**
   * Starts the wallet and synchronises it with the chain, which can take minutes on a long
   * chain. Calling it again returns the same start.
   */
  start(): Promise<void>
  /** Known without a start, so a call can be built for the wallet to balance later. */
  publicKeys(): WalletPublicKeys
  /** The bech32m address NIGHT is sent to, which generates the wallet's DUST once registered. Known without a start. */
  unshieldedAddress(): string
  /** Spendable DUST in SPECK, read from the synced state. Starts the wallet when nothing has. */
  dustBalance(): Promise<bigint>
  /**
   * Balances, signs and finalises the unbound bytes, resolving with the finalised bytes. Waits
   * for a start in progress and rejects when the wallet was never started.
   */
  finalize(unboundTx: string): Promise<string>
  /**
   * The wallet and midnight provider slots of a midnight-js provider set, once synced. Starts
   * the wallet when nothing has, and a failed start is dropped so the next call retries.
   */
  provider(): Promise<WalletProvider & MidnightProvider>
}
