import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { flow } from "@/lib/midnight/flow";
import * as balances from "@/lib/midnight/vault-balances";
import { useVaultBalances, VaultBalancesProvider } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";

import { createVaultFixture } from "../sdk/vault-fixture";

vi.mock(import("@/providers/vault-context"), { spy: true });
vi.mock(import("@/lib/midnight/vault-balances"), { spy: true });
afterEach(() => {
  cleanup();
  flow.reset();
  vi.useRealTimers();
});

it("suspends actual balance polling during proving and resumes after settlement", async () => {
  const binding = await createVaultFixture();
  vi.mocked(useVault).mockReturnValue({
    identitySecret: "",
    setIdentitySecret: vi.fn(),
    clearIdentity: vi.fn(),
    status: "ready",
    error: null,
    binding,
    requireBinding: () => binding,
    retry: vi.fn(),
    rebuild: vi.fn(),
    disconnect: vi.fn(),
  });
  const read = vi.mocked(balances.readBalances).mockResolvedValue({
    night: 1n,
    dust: 2n,
    perToken: {},
  });
  vi.useFakeTimers();
  const query = new QueryClient();
  const mounted = renderHook(useVaultBalances, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={query}>
        <VaultBalancesProvider>{children}</VaultBalancesProvider>
      </QueryClientProvider>
    ),
  });
  try {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(read).toHaveBeenCalledTimes(2);
    act(() => {
      flow.start("deposit");
      flow.set("proving");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(read).toHaveBeenCalledTimes(2);
    act(() => {
      flow.set("done");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(read).toHaveBeenCalledTimes(3);
    expect(mounted.result.current.balances).toEqual({ night: 1n, dust: 2n, perToken: {} });
    mounted.unmount();
    await vi.advanceTimersByTimeAsync(15000);
    expect(read).toHaveBeenCalledTimes(3);
    expect(query.getQueryCache().findAll({ queryKey: ["vault-balances"] })).toEqual([]);
  } finally {
    mounted.unmount();
    query.clear();
    vi.useRealTimers();
    binding.providers.privateStateProvider.dispose();
    await binding.providers.publicDataProvider.dispose();
  }
});
