/** Finalised reads of an account on the configured chain. One call is one RPC round trip. */
export interface EthereumAccountReader {
  /** The account's native balance in wei. */
  balance(account: string): Promise<bigint>
}
