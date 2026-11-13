import type { SeedWallet } from '@/lib/midnight/wallet/seed-wallet'
import type { Wallet } from '@/lib/midnight/wallet/wallet'

/** Narrows to the seed wallet for the controls only it offers, without loading the wallet SDK. */
export function isSeedWallet(wallet: Wallet): wallet is SeedWallet {
  return wallet.kind === 'seed'
}
