import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import type { Address } from "viem";
import { afterEach, expect, it, vi } from "vitest";

import { createEvmChainConfig } from "@/lib/config/evm";
import { browserWalletConnection } from "@/lib/config/evm-wallet";
import { useWalletBalances } from "@/providers/evm-balances-context";
import { EvmWalletProvider, useEvmWallet } from "@/providers/evm-wallet-context";

import { account, browserWalletFixture } from "../evm/browser-wallet-fixture";

afterEach(cleanup);

it("discards pending connections and evicts late balances after disconnect", async () => {
  const query = new QueryClient();
  const first = browserWalletFixture();
  const accountGate = Promise.withResolvers<Address[]>();
  first.controls.requestGate = accountGate.promise;
  const second = browserWalletFixture();
  const balanceGate = Promise.withResolvers<bigint>();
  const readBalance = vi
    .spyOn(second.publicClient, "getBalance")
    .mockReturnValue(balanceGate.promise);
  const { result, unmount } = renderHook(
    () => {
      const connection = useEvmWallet();
      return { connection, balances: useWalletBalances(connection.wallet, []) };
    },
    {
      wrapper: ({ children }) => (
        <StrictMode>
          <QueryClientProvider client={query}>
            <EvmWalletProvider>{children}</EvmWalletProvider>
          </QueryClientProvider>
        </StrictMode>
      ),
    },
  );
  try {
    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.connection.connect({
        key: first.provider,
        create: () => first.wallet,
      });
      result.current.connection.disconnect();
    });
    await act(async () => {
      accountGate.resolve([account]);
      await pending;
    });
    expect(result.current.connection.wallet).toBeNull();
    expect(first.events.eventNames()).toHaveLength(0);
    await act(async () => {
      await result.current.connection.connect({
        key: second.provider,
        create: () => second.wallet,
      });
    });
    await waitFor(() => {
      expect(readBalance).toHaveBeenCalled();
    });
    expect(
      query.getQueryCache().findAll({ queryKey: ["evm-balances", second.wallet.sessionId] }),
    ).toHaveLength(1);
    act(() => {
      result.current.connection.disconnect();
    });
    await act(async () => {
      balanceGate.resolve(5n);
      await balanceGate.promise;
    });
    expect(result.current.balances.data).toBeUndefined();
    expect(
      query.getQueryCache().findAll({ queryKey: ["evm-balances", second.wallet.sessionId] }),
    ).toHaveLength(0);
    expect(second.events.eventNames()).toHaveLength(0);
  } finally {
    unmount();
    query.clear();
    first.wallet.disconnect();
    second.wallet.disconnect();
  }
});

it("retains the local fork mismatch reason and reconnects after provider correction", async () => {
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_NETWORK_ID", "undeployed");
  vi.stubEnv("NEXT_PUBLIC_LOCAL_EVM_MARKER_ADDRESS", account);
  vi.stubEnv("NEXT_PUBLIC_LOCAL_EVM_MARKER_CODE", "0x1234");
  const f = browserWalletFixture();
  f.wallet.disconnect();
  const choice = { id: "local", name: "Local", provider: f.provider };
  const config = createEvmChainConfig("https://fixture.invalid");
  const { result, unmount } = renderHook(useEvmWallet, {
    wrapper: ({ children }) => (
      <StrictMode>
        <EvmWalletProvider>{children}</EvmWalletProvider>
      </StrictMode>
    ),
  });
  try {
    await act(async () => {
      await result.current.connect(browserWalletConnection(choice, config));
    });
    expect(result.current.error).toMatch(/local fork marker/);
    expect(result.current.error).toContain(config.rpcUrl);
    expect(result.current.wallet).toBeNull();
    expect(result.current.connecting).toBe(false);
    f.controls.markerCode = "0x1234";
    await act(async () => {
      await result.current.connect(browserWalletConnection(choice, config));
    });
    expect(result.current.wallet?.account).toBe(account);
    expect(result.current.error).toBeNull();
  } finally {
    unmount();
  }
  expect(f.events.eventNames()).toHaveLength(0);
});
