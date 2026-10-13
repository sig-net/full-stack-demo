import type { ActivityEntry } from '@/lib/activity/activity-entry'
import type { AssetAmount } from '@/lib/asset-amount'
import { BUNDLED_NETWORK_ICONS, BUNDLED_TOKEN_ICONS } from '@/lib/tokens/bundled-icons'

const BTC_ON_BITCOIN: AssetAmount = {
  assetSymbol: 'BTC',
  networkName: 'Bitcoin',
  amount: '0.013',
  usdValue: '1478.35',
  icon: BUNDLED_TOKEN_ICONS.BTC,
  networkIcon: BUNDLED_NETWORK_ICONS.bitcoin,
}

const ETH_ON_ETHEREUM: AssetAmount = {
  assetSymbol: 'ETH',
  networkName: 'Ethereum',
  amount: '0.5',
  usdValue: '1478.35',
  icon: BUNDLED_TOKEN_ICONS.ETH,
  networkIcon: BUNDLED_NETWORK_ICONS.ethereum,
}

/** The activity drawn in the design, shown until a transaction data source replaces it. */
export const DUMMY_ACTIVITY: readonly ActivityEntry[] = [
  {
    id: 'send-1',
    kind: 'send',
    from: BTC_ON_BITCOIN,
    to: { kind: 'wallet', addressLabel: '1710B4…6dFa' },
    timestampLabel: 'July 8, 2025 07:18 PM',
    status: 'pending',
    transactionHashLabel: '0x10B4…6dFa',
  },
  {
    id: 'swap-1',
    kind: 'swap',
    from: ETH_ON_ETHEREUM,
    to: { kind: 'asset', asset: BTC_ON_BITCOIN },
    timestampLabel: 'July 8, 2025 07:18 PM',
    status: 'complete',
    transactionHashLabel: '0x10B4…6dFa',
  },
  {
    id: 'deposit-1',
    kind: 'deposit',
    from: ETH_ON_ETHEREUM,
    to: { kind: 'wallet', addressLabel: '0x10B4…6dFa' },
    timestampLabel: 'July 8, 2025 07:18 PM',
    status: 'complete',
    transactionHashLabel: '0x10B4…6dFa',
  },
]
