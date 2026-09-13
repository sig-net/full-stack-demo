"use client";

import type { ActivityTransaction } from "@/components/activity-list-table";
import type { MidnightTxRecord } from "@/lib/midnight/tx-history";
import { formatActivityDate } from "@/lib/utils/date-formatting";

import { useMidnightHistory } from "./use-midnight-history";

const CHAIN = "midnight";

function toActivity(r: MidnightTxRecord): ActivityTransaction {
  const explorer = r.explorerUrl;
  const fromToken =
    r.type === "Deposit"
      ? { symbol: "WALLET", chain: CHAIN, amount: r.fromAmount, usdValue: "" }
      : {
          symbol: r.fromSymbol,
          chain: CHAIN,
          amount: r.fromAmount,
          usdValue: "",
        };
  const toToken =
    r.type === "Withdraw"
      ? { symbol: "WALLET", chain: CHAIN, amount: r.toAmount, usdValue: "" }
      : {
          symbol: r.toSymbol,
          chain: CHAIN,
          amount: r.toAmount || r.toSymbol,
          usdValue: "",
        };
  return {
    id: r.id,
    requestId: r.id,
    type: r.type,
    fromToken,
    toToken,
    address: r.counterparty,
    timestamp: formatActivityDate(r.timestampRaw),
    timestampRaw: r.timestampRaw,
    status: r.status,
    transactionHash: r.txHash,
    failureReason: r.failureReason,
    explorerUrl: r.txHash && explorer ? `${explorer}/tx/${r.txHash}` : undefined,
  };
}

/**
 * Subscribes to operation history and retains captured explorer links in Activity rows.
 *
 * @returns Live rows with exact recorded amount strings and formatted timestamps.
 */
export function useMidnightTransactions(): ActivityTransaction[] {
  const txs = useMidnightHistory();
  return txs.map(toActivity);
}
