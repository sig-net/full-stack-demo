import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ActivityTransaction } from "@/components/activity-list-table";
import { TransactionDetailsDialog } from "@/components/activity-list-table/transaction-details-dialog";
import { useMidnightTransactions } from "@/hooks/use-midnight-transactions";
import { createEvmChainConfig } from "@/lib/config/evm";
import { midnightTxHistory } from "@/lib/midnight/tx-history";

afterEach(cleanup);

const transactionHash = `0x${"ab".repeat(32)}`;
const transaction: ActivityTransaction = {
  id: "fixture",
  type: "Deposit",
  timestamp: "fixture time",
  timestampRaw: 1,
  status: "completed",
  transactionHash,
};

describe("EVM explorer links", () => {
  it("omits explorer links for local RPC configuration", () => {
    const local = createEvmChainConfig(undefined);
    expect(local.explorerUrl).toBe("");
    render(
      <TransactionDetailsDialog transaction={transaction} open onOpenChange={() => undefined} />,
    );

    expect(screen.queryByRole("link", { name: /view sepolia transaction/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy Transaction hash" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show full Transaction hash" }));
    expect(screen.getByRole("dialog", { name: "Full Transaction hash" }).textContent).toContain(
      transactionHash,
    );
    expect(screen.queryByRole("link", { name: /view sepolia transaction/i })).toBeNull();
  });

  it("uses the Sepolia explorer for hosted RPC configuration", () => {
    const hosted = createEvmChainConfig("https://rpc.example.invalid");
    const explorer = hosted.explorerUrl;
    expect(explorer).toBe("https://sepolia.etherscan.io");

    const explorerUrl = `${explorer}/tx/${transactionHash}`;
    render(
      <TransactionDetailsDialog
        transaction={{ ...transaction, explorerUrl }}
        open
        onOpenChange={() => undefined}
      />,
    );

    const link = screen.getByRole("link", { name: /view sepolia transaction/i });
    expect(link.getAttribute("href")).toBe(explorerUrl);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("maps recorded hashes to explorer links only when the record has an explorer origin", () => {
    const { result } = renderHook(useMidnightTransactions);
    const localRecord = {
      id: "local-fixture",
      type: "Deposit" as const,
      fromSymbol: "WALLET",
      fromAmount: "1",
      toSymbol: "USDC",
      toAmount: "1",
      status: "completed" as const,
      timestampRaw: 1,
      txHash: transactionHash,
      explorerUrl: undefined,
    };
    act(() => {
      midnightTxHistory.add(localRecord);
    });
    expect(result.current[0]?.transactionHash).toBe(transactionHash);
    expect(result.current[0]?.explorerUrl).toBeUndefined();

    act(() => {
      midnightTxHistory.update(localRecord.id, { explorerUrl: "https://sepolia.etherscan.io" });
    });
    expect(result.current[0]?.explorerUrl).toBe(
      `https://sepolia.etherscan.io/tx/${transactionHash}`,
    );
  });
});
