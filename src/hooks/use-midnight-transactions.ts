'use client';

import { getEvmChainConfig } from '@/lib/config/evm';
import { useEffect, useState } from 'react';

import {
  midnightTxHistory,
  type MidnightTxRecord,
} from '@/lib/midnight/tx-history';
import { formatActivityDate } from '@/lib/utils/date-formatting';
import type { ActivityTransaction } from '@/components/activity-list-table';

const CHAIN = 'midnight';

function toActivity(r: MidnightTxRecord): ActivityTransaction {
  const explorer = getEvmChainConfig().explorerUrl;
  const fromToken =
    r.type === 'Deposit'
      ? { symbol: 'WALLET', chain: CHAIN, amount: r.fromAmount, usdValue: '' }
      : {
          symbol: r.fromSymbol,
          chain: CHAIN,
          amount: r.fromAmount,
          usdValue: '',
        };
  const toToken =
    r.type === 'Withdraw'
      ? { symbol: 'WALLET', chain: CHAIN, amount: r.toAmount, usdValue: '' }
      : {
          symbol: r.toSymbol,
          chain: CHAIN,
          amount: r.toAmount || r.toSymbol,
          usdValue: '',
        };
  return {
    id: r.id,
    type: r.type,
    fromToken,
    toToken,
    address: r.counterparty,
    timestamp: formatActivityDate(r.timestampRaw),
    timestampRaw: r.timestampRaw,
    status: r.status,
    transactionHash: r.txHash,
    failureReason: r.failureReason,
    explorerUrl:
      r.txHash && explorer ? `${explorer}/tx/${r.txHash}` : undefined,
  };
}

/** Live Midnight vault operations mapped to the Activity table's row shape. */
export function useMidnightTransactions(): ActivityTransaction[] {
  const [txs, setTxs] = useState<MidnightTxRecord[]>([]);
  useEffect(() => midnightTxHistory.subscribe(setTxs), []);
  return txs.map(toActivity);
}
