import type { Wallet } from '@/lib/midnight/wallet/wallet'

export type WalletConnectionStatus = 'restoring' | 'connecting' | 'connected' | 'not connected'

interface WalletConnectionState {
  readonly wallet: Wallet | null
  readonly connecting: boolean
  readonly restoring: boolean
}

export function walletConnectionStatus({
  wallet,
  connecting,
  restoring,
}: WalletConnectionState): WalletConnectionStatus {
  if (restoring) return 'restoring'
  if (connecting) return 'connecting'
  return wallet === null ? 'not connected' : 'connected'
}
