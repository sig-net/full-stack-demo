export interface WalletMetadata {
  readonly kind: 'seed' | 'browser';
  readonly name: string;
  readonly iconUrl?: string;
  readonly id: string;
  readonly accountDetail: string;
}
