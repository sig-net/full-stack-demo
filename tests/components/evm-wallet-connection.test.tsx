import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import type { Address } from "viem";
import { afterEach, expect, it, vi } from "vitest";

import { sepoliaChainConfig } from "@/lib/config/runtime";
import { browserWalletConnection } from "@/lib/evm/wallet/connections";
import * as rpc from "@/lib/rpc";
import { ConfigurationProvider } from "@/providers/configuration-context";
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
            <ConfigurationProvider>
              <EvmWalletProvider>{children}</EvmWalletProvider>
            </ConfigurationProvider>
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

it("connects a local wallet without a deployment marker", async () => {
  const f = browserWalletFixture();
  f.wallet.disconnect();
  const choice = { id: "local", name: "Local", provider: f.provider };
  const config = sepoliaChainConfig("http://127.0.0.1:8545");
  vi.spyOn(rpc, "getEthereumProvider").mockReturnValue(f.publicClient);
  const { result, unmount } = renderHook(useEvmWallet, {
    wrapper: ({ children }) => (
      <StrictMode>
        <ConfigurationProvider>
          <EvmWalletProvider>{children}</EvmWalletProvider>
        </ConfigurationProvider>
      </StrictMode>
    ),
  });
  try {
    await act(async () => {
      await result.current.connect(browserWalletConnection(choice, config));
    });
    expect(result.current.wallet?.account).toBe(account);
    expect(result.current.error).toBeNull();
    expect(result.current.connecting).toBe(false);
  } finally {
    unmount();
  }
  expect(f.events.eventNames()).toHaveLength(0);
});

it("connects an independently configured EVM chain without Midnight deployment or local marker inputs", async () => {
  const f = browserWalletFixture();
  f.wallet.disconnect();
  f.controls.chain = "0x1";
  vi.mocked(f.publicClient.getChainId).mockResolvedValue(1);
  vi.spyOn(rpc, "getEthereumProvider").mockReturnValue(f.publicClient);
  const config = {
    network: "mainnet" as const,
    chainId: 1n,
    rpcUrl: "https://fixture.invalid",
    explorerUrl: "",
  };
  const connection = browserWalletConnection(
    { id: "independent", name: "Independent", provider: f.provider },
    config,
  );
  const { result, unmount } = renderHook(useEvmWallet, {
    wrapper: ({ children }) => (
      <ConfigurationProvider>
        <EvmWalletProvider>{children}</EvmWalletProvider>
      </ConfigurationProvider>
    ),
  });
  try {
    await act(async () => {
      await result.current.connect(connection);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.wallet?.chain.id).toBe(1);
    expect(result.current.wallet?.account).toBe(account);
    expect(f.calls).not.toContain("eth_getCode");
    expect(f.calls).not.toContain("wallet_switchEthereumChain");
  } finally {
    unmount();
  }
  expect(f.events.eventNames()).toHaveLength(0);
});
