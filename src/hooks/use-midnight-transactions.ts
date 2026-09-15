"use client";

import { MidnightNetwork } from "@sig-net/midnight";
import { z } from "zod";

import type { ActivityExplorerLinks, ActivityTransaction } from "@/components/activity-list-table";
import type { NetworkId } from "@/lib/config/midnight";
import {
  evmExplorerLink,
  type EvmExplorerSource,
  type ExplorerAvailability,
  midnightExplorerLink,
} from "@/lib/explorer";
import type { MidnightTxRecord } from "@/lib/midnight/tx-history";
import { formatActivityDate } from "@/lib/utils/date-formatting";

import { useMidnightHistory } from "./use-midnight-history";

const CHAIN = "midnight";

function capturedMidnightNetwork(networkId: string | undefined): NetworkId | undefined {
  const parsed = z.enum(MidnightNetwork).safeParse(networkId);
  return parsed.success ? parsed.data : undefined;
}

function explorerLinks(
  r: MidnightTxRecord,
  fromAddress: string | undefined,
  toAddress: string | undefined,
): ActivityExplorerLinks {
  // Records keep the chain, explorer and network applied when they were submitted, and every link
  // below resolves from those captured values, so a settled receipt stays on its own chain for the
  // life of the record.
  const evmSource: EvmExplorerSource = {
    explorerUrl: r.explorerUrl ?? "",
    chainId: r.chainId === undefined ? null : BigInt(r.chainId),
  };
  const address = (value: string | undefined): ExplorerAvailability =>
    value === undefined
      ? { status: "unavailable", reason: "This operation records no EVM counterparty address." }
      : evmExplorerLink(evmSource, "address", value);
  return {
    evmTransaction:
      r.evmTxHash === undefined
        ? {
            status: "unavailable",
            reason: "No settled EVM transaction is recorded for this operation yet.",
          }
        : evmExplorerLink(evmSource, "transaction", r.evmTxHash),
    midnightTransaction:
      r.midnightTxHash === undefined
        ? {
            status: "unavailable",
            reason: "No settled Midnight transaction is recorded for this operation yet.",
          }
        : midnightExplorerLink(
            capturedMidnightNetwork(r.networkId),
            "transaction",
            r.midnightTxHash,
          ),
    fromAddress: address(fromAddress),
    toAddress: address(toAddress),
    vaultContract:
      r.vaultContractAddress === undefined
        ? { status: "unavailable", reason: "This record captured no Midnight vault contract." }
        : midnightExplorerLink(
            capturedMidnightNetwork(r.networkId),
            "contract",
            r.vaultContractAddress,
          ),
  };
}

function toActivity(r: MidnightTxRecord): ActivityTransaction {
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
    evmTransactionHash: r.evmTxHash,
    midnightTransactionHash: r.midnightTxHash,
    failureReason: r.failureReason,
    explorer: explorerLinks(
      r,
      fromToken.symbol === "WALLET" ? fromToken.amount : undefined,
      toToken.symbol === "WALLET" ? toToken.amount : undefined,
    ),
  };
}

/**
 * Subscribes to operation history and resolves each row's explorer links from its captured chain.
 *
 * @returns Live rows with exact recorded amount strings and formatted timestamps.
 */
export function useMidnightTransactions(): ActivityTransaction[] {
  const txs = useMidnightHistory();
  return txs.map(toActivity);
}
