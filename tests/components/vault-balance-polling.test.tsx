import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type * as React from "react";
import { afterEach, expect, it, vi } from "vitest";

import { MIDNIGHT_TOKENS } from "@/lib/constants/token-metadata";
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
    const operation = {};
    act(() => {
      flow.start("deposit", operation);
      flow.set("proving", operation);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(read).toHaveBeenCalledTimes(2);
    act(() => {
      flow.set("done", operation);
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

it("scopes the deposit address observation to its endpoint, identity and tokens", async () => {
  const first = await createVaultFixture();
  const second = await createVaultFixture();
  const replacement = {
    ...second,
    sessionId: "replacement",
    environment: { ...second.environment, evmRpcUrl: "https://replacement.invalid" },
    depositAddress: "0xD445d8bf69A4E43a5a31f49940AE100c93F9151C",
  };
  vi.mocked(useVault).mockReturnValue({
    status: "ready",
    error: null,
    binding: first,
    requireBinding: () => first,
    retry: vi.fn(),
    rebuild: vi.fn(),
    disconnect: vi.fn(),
  });
  const read = vi.mocked(balances.readBalances).mockResolvedValue({
    night: 1n,
    dust: 2n,
    perToken: {},
  });
  const query = new QueryClient();
  // The tree carries no EVM wallet: this observation reads token balances over JSON-RPC alone.
  const wrapper = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
    <QueryClientProvider client={query}>
      <VaultBalancesProvider>{children}</VaultBalancesProvider>
    </QueryClientProvider>
  );
  const mounted = renderHook(useVaultBalances, { wrapper });
  try {
    await waitFor(() => {
      expect(mounted.result.current.checkedAt).not.toBeNull();
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]?.[1].evmRpcUrl).toBe(first.environment.evmRpcUrl);
    expect(read.mock.calls[0]?.[2]).toEqual(MIDNIGHT_TOKENS.map((token) => token.erc20Address));
    expect(read.mock.calls[0]?.[3]).toBe(first.depositAddress);

    vi.mocked(useVault).mockReturnValue({
      status: "ready",
      error: null,
      binding: replacement,
      requireBinding: () => replacement,
      retry: vi.fn(),
      rebuild: vi.fn(),
      disconnect: vi.fn(),
    });
    mounted.rerender();
    await waitFor(() => {
      expect(read).toHaveBeenCalledTimes(2);
    });
    expect(read.mock.calls[1]?.[1].evmRpcUrl).toBe("https://replacement.invalid");
    expect(read.mock.calls[1]?.[3]).toBe(replacement.depositAddress);
    expect(
      query
        .getQueryCache()
        .findAll({ queryKey: ["vault-balances"] })
        .map((entry) => entry.queryKey),
    ).toEqual([["vault-balances", "replacement"]]);
  } finally {
    mounted.unmount();
    query.clear();
    first.providers.privateStateProvider.dispose();
    await first.providers.publicDataProvider.dispose();
    second.providers.privateStateProvider.dispose();
    await second.providers.publicDataProvider.dispose();
  }
});
