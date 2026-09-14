import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";

import type { ActivityTransaction } from "@/components/activity-list-table";
import { TransactionDetailsDialog } from "@/components/activity-list-table/transaction-details-dialog";
import { useMidnightTransactions } from "@/hooks/use-midnight-transactions";
import { midnightTxHistory, type MidnightTxRecord } from "@/lib/midnight/tx-history";
import { MidnightWalletProvider } from "@/providers/midnight-wallet-context";
import { RuntimeConfigProvider } from "@/providers/runtime-config-context";
import { VaultProvider } from "@/providers/vault-context";
import { VaultIdentityProvider } from "@/providers/vault-identity-context";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const record = (id: string): MidnightTxRecord => ({
  id,
  type: "Deposit",
  fromSymbol: "WALLET",
  fromAmount: "0x123",
  toSymbol: "USDC",
  toAmount: "10 USDC",
  status: "pending",
  timestampRaw: 1,
  explorerUrl: "https://sepolia.etherscan.io",
});

describe("activity history", () => {
  it("maps live pending, interrupted, failed, completed and refunded updates and unsubscribes", async () => {
    let unsubscribeCalls = 0;
    const originalSubscribe = midnightTxHistory.subscribe.bind(midnightTxHistory);
    const subscribeSpy = vi.spyOn(midnightTxHistory, "subscribe").mockImplementation((listener) => {
      const unsubscribe = originalSubscribe(listener);
      return () => {
        unsubscribeCalls += 1;
        unsubscribe();
      };
    });
    const { result, unmount } = renderHook(useMidnightTransactions);
    const fixture = record("history-live");
    act(() => {
      midnightTxHistory.add(fixture);
    });
    await waitFor(() => {
      expect(result.current[0]?.status).toBe("pending");
    });
    act(() => {
      midnightTxHistory.update(fixture.id, {
        status: "interrupted",
        failureReason: "Observation interrupted",
      });
    });
    await waitFor(() => {
      expect(result.current[0]?.status).toBe("interrupted");
      expect(result.current[0]?.failureReason).toBe("Observation interrupted");
    });
    act(() => {
      midnightTxHistory.update(fixture.id, { status: "failed", failureReason: "Proof failed" });
    });
    await waitFor(() => {
      expect(result.current[0]?.failureReason).toBe("Proof failed");
    });
    act(() => {
      midnightTxHistory.update(fixture.id, { status: "completed", txHash: "0xabc" });
    });
    await waitFor(() => {
      expect(result.current[0]?.status).toBe("completed");
      expect(result.current[0]?.explorerUrl).toBe("https://sepolia.etherscan.io/tx/0xabc");
    });
    act(() => {
      midnightTxHistory.update(fixture.id, { status: "refunded", type: "Supply" });
    });
    await waitFor(() => {
      expect(result.current[0]?.status).toBe("refunded");
      expect(result.current[0]?.type).toBe("Supply");
    });
    unmount();
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(unsubscribeCalls).toBe(1);
    const snapshot = result.current;
    act(() => {
      midnightTxHistory.update(fixture.id, { status: "completed" });
    });
    expect(result.current).toBe(snapshot);
    subscribeSpy.mockRestore();
  });

  it("renders failure, hash and explorer details for a selected operation", () => {
    const transaction: ActivityTransaction = {
      id: "details-fixture",
      type: "Supply",
      timestamp: "fixture time",
      status: "refunded",
      failureReason: "Fixture proof failed",
      transactionHash: "0xabc",
      explorerUrl: "https://sepolia.etherscan.io/tx/0xabc",
    };
    render(<TransactionDetailsDialog transaction={transaction} open onOpenChange={vi.fn()} />);
    expect(screen.getByText("Supply Details")).toBeTruthy();
    expect(screen.getByText("Status: refunded")).toBeTruthy();
    expect(screen.getByText("Fixture proof failed")).toBeTruthy();
    expect(screen.getByText("0xabc")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy Transaction hash" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /view sepolia transaction/i })).toBeTruthy();
  });
});

it("keeps selected details open while the selected row updates", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const pendingRow: MidnightTxRecord = {
    id: "selected-fixture",
    type: "Deposit",
    fromSymbol: "WALLET",
    fromAmount: "1",
    toSymbol: "USDC",
    toAmount: "1",
    status: "pending",
    timestampRaw: 2,
  };
  act(() => {
    midnightTxHistory.add(pendingRow);
  });
  const queryClient = new QueryClient();
  const { ActivityListTable } = await import("@/components/activity-list-table");
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RuntimeConfigProvider>
        <MidnightWalletProvider>
          <VaultIdentityProvider>
            <VaultProvider>
              <ActivityListTable />
            </VaultProvider>
          </VaultIdentityProvider>
        </MidnightWalletProvider>
      </RuntimeConfigProvider>
    </QueryClientProvider>,
  );
  onTestFinished(() => {
    view.unmount();
    queryClient.clear();
  });
  fireEvent.click(screen.getByRole("row", { name: /deposit/i }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByText("Status: pending")).toBeTruthy();
  act(() => {
    midnightTxHistory.update(pendingRow.id, {
      status: "failed",
      failureReason: "Updated while open",
    });
  });
  await waitFor(() => {
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Status: failed")).toBeTruthy();
    expect(screen.getByText("Updated while open")).toBeTruthy();
  });
});
