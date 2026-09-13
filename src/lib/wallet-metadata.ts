/** Display identity shared by EVM and Midnight adapters without exposing signing credentials. */
export interface WalletMetadata {
  readonly kind: "seed" | "browser";
  readonly name: string;
  readonly iconUrl?: string;
  readonly id: string;
  readonly accountDetail: string;
}
