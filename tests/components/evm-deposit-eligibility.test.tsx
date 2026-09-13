import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type * as React from "react";
import { afterEach, expect, it, vi } from "vitest";

import { useEvmDepositEligibility } from "@/hooks/use-evm-deposit-eligibility";
import { EvmBalancesProvider } from "@/providers/evm-balances-context";
import { useEvmWallet } from "@/providers/evm-wallet-context";
import { RuntimeConfigProvider } from "@/providers/runtime-config-context";

import { mockMatchingRuntimeServer } from "../config/runtime-server-fixture";
import { browserWalletFixture } from "../evm/browser-wallet-fixture";

vi.mock(import("@/providers/evm-wallet-context"), { spy: true });
afterEach(cleanup);

const token = "0x0000000000000000000000000000000000000001";
const destination = "0x0000000000000000000000000000000000000002";

it("computes EVM deposit eligibility from observed decimals, balances and fee estimates", async () => {
  mockMatchingRuntimeServer();
  const fixture = browserWalletFixture();
  let nativeBalance = 3n;
  let readMode: "ok" | "decimals-error" | "balance-error" = "ok";
  let feeMode: "ok" | "error" = "ok";
  vi.spyOn(fixture.publicClient, "getBalance").mockImplementation(() =>
    Promise.resolve(nativeBalance),
  );
  vi.spyOn(fixture.publicClient, "readContract").mockImplementation(({ functionName }) => {
    if (readMode === "decimals-error" && functionName === "decimals")
      return Promise.reject(new Error("decimals read failed"));
    if (readMode === "balance-error" && functionName === "balanceOf")
      return Promise.reject(new Error("balance read failed"));
    return Promise.resolve(functionName === "decimals" ? 8 : 50n);
  });
  vi.spyOn(fixture.publicClient, "estimateGas").mockImplementation(() =>
    feeMode === "error" ? Promise.reject(new Error("gas estimate failed")) : Promise.resolve(2n),
  );
  vi.spyOn(fixture.publicClient, "getGasPrice").mockResolvedValue(1n);
  vi.mocked(useEvmWallet).mockReturnValue({
    wallet: fixture.wallet,
    connecting: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
  await fixture.wallet.connect();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
    return (
      <QueryClientProvider client={queryClient}>
        <RuntimeConfigProvider>
          <EvmBalancesProvider tokens={[token]}>{children}</EvmBalancesProvider>
        </RuntimeConfigProvider>
      </QueryClientProvider>
    );
  };
  const { result, rerender } = renderHook(
    ({ amount }: { amount: string }) => useEvmDepositEligibility(token, amount, destination),
    { initialProps: { amount: "0.00000007" }, wrapper },
  );
  await waitFor(() => {
    expect(result.current.ready).toBe(true);
  });
  rerender({ amount: "0.00000051" });
  expect(result.current.ready).toBe(false);
  expect(result.current.error).toBe("Insufficient token balance.");
  rerender({ amount: "0.000000001" });
  expect(result.current.ready).toBe(false);
  expect(result.current.error).toMatch(/decimal places/);

  nativeBalance = 0n;
  await queryClient.invalidateQueries({ queryKey: ["evm-balances"] });
  rerender({ amount: "0.00000007" });
  await waitFor(() => {
    expect(result.current.ready).toBe(false);
    expect(result.current.error).toMatch(/native balance/);
  });

  nativeBalance = 3n;
  readMode = "decimals-error";
  await queryClient.invalidateQueries({ queryKey: ["evm-balances"] });
  await waitFor(() => {
    expect(result.current.ready).toBe(false);
    expect(result.current.error).toMatch(/balance and decimals are unavailable/);
  });

  readMode = "balance-error";
  await queryClient.invalidateQueries({ queryKey: ["evm-balances"] });
  await waitFor(() => {
    expect(result.current.ready).toBe(false);
    expect(result.current.error).toMatch(/balance and decimals are unavailable/);
  });

  readMode = "ok";
  await queryClient.invalidateQueries({ queryKey: ["evm-balances"] });
  await waitFor(() => {
    expect(result.current.ready).toBe(true);
  });
  feeMode = "error";
  await queryClient.invalidateQueries({ queryKey: ["evm-deposit-fee"] });
  await waitFor(() => {
    expect(result.current.ready).toBe(false);
    expect(result.current.error).toBe("Network fee estimate is unavailable.");
  });
});
