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
  /**
   * Balances, signs and finalises the unbound bytes, resolving with the finalized bytes. Waits
   * for a start in progress and rejects when the wallet was never started.
   */
  finalize(unboundTx: string): Promise<string>
}
