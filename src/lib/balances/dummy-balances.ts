import type { AssetAmount } from '@/lib/asset-amount'

/** The balances drawn in the design, shown until a wallet data source replaces them. */
export const DUMMY_BALANCES: readonly AssetAmount[] = [
  { assetSymbol: 'SOL', networkName: 'Solana', amount: '1.8', usdValue: '5387.89' },
  { assetSymbol: 'ETH', networkName: 'Ethereum', amount: '1.8', usdValue: '5387.89' },
  { assetSymbol: 'BTC', networkName: 'Bitcoin', amount: '0.013', usdValue: '1470.67' },
]
