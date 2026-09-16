import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { type Address, createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { afterEach, expect, it, type MockInstance, vi } from "vitest";

import { SeedWallet } from "@/lib/evm/wallet/SeedWallet";
import type { WalletConnection } from "@/lib/evm/wallet/Wallet";
import { ConfigurationProvider } from "@/providers/configuration-context";
import { useAddressFunding } from "@/providers/evm-local-funding-context";
import { EvmWalletProvider, useEvmWallet } from "@/providers/evm-wallet-context";

afterEach(cleanup);

it("shares one signing session and disposes pending or mounted resources once in StrictMode", async () => {
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http("https://fixture.invalid"),
  });
  vi.spyOn(publicClient, "getChainId").mockResolvedValue(sepolia.id);
  const disposals: MockInstance<SeedWallet["disconnect"]>[] = [];
  const createConnection = (gate?: Promise<void>): WalletConnection => ({
    key: {},
    create: () => {
      const wallet = new SeedWallet(
        sepolia,
        publicClient,
        "https://fixture.invalid",
        "07".repeat(32),
      );
      disposals.push(vi.spyOn(wallet, "disconnect"));
      if (gate) {
        const connect = wallet.connect.bind(wallet);
        vi.spyOn(wallet, "connect").mockImplementation(async () => {
          await gate;
          await connect();
        });
      }
      return wallet;
    },
  });
  const { result, unmount } = renderHook(
    () => ({ first: useEvmWallet(), second: useEvmWallet() }),
    {
      wrapper: ({ children }) => (
        <StrictMode>
          <ConfigurationProvider>
            <EvmWalletProvider>{children}</EvmWalletProvider>
          </ConfigurationProvider>
        </StrictMode>
      ),
    },
  );
  await act(async () => {
    await result.current.first.connect(createConnection());
  });
  expect(result.current.first.wallet).toBe(result.current.second.wallet);
  expect(result.current.first.wallet?.account).toMatch(/^0x[0-9a-fA-F]{40}$/);
  expect(disposals).toHaveLength(1);
  act(() => {
    result.current.first.disconnect();
  });
  expect(result.current.second.wallet).toBeNull();
  const pendingGate = Promise.withResolvers<undefined>();
  const pendingChoice = createConnection(pendingGate.promise);
  let pending: Promise<void> | undefined;
  act(() => {
    pending = result.current.first.connect(pendingChoice);
    expect(result.current.second.connect(pendingChoice)).toBe(pending);
    result.current.first.disconnect();
  });
  await act(async () => {
    pendingGate.resolve(undefined);
    await pending;
  });
  expect(result.current.first.wallet).toBeNull();
  await act(async () => {
    await result.current.first.connect(createConnection());
  });
  unmount();
  expect(disposals).toHaveLength(3);
  for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
});

it("deduplicates funding, rejects replaced recipients and preserves settled funding after refresh failure", async () => {
  const query = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const bodies: (BodyInit | null | undefined)[] = [];
  let gate = Promise.withResolvers<Response>();
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>((_input, options) => {
      bodies.push(options?.body);
      return gate.promise;
    }),
  );
  const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const firstAddress: Address = "0x1111111111111111111111111111111111111111";
  const secondAddress: Address = "0x2222222222222222222222222222222222222222";
  const { result, rerender, unmount } = renderHook(
    ({ address }: { address: Address }) => useAddressFunding(address, address, refresh),
    {
      initialProps: { address: firstAddress },
      wrapper: ({ children }) => (
        <StrictMode>
          <QueryClientProvider client={query}>{children}</QueryClientProvider>
        </StrictMode>
      ),
    },
  );
  try {
    let first: Promise<void> | undefined;
    act(() => {
      first = result.current.fund();
      expect(result.current.fund()).toBe(first);
    });
    await waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    rerender({ address: secondAddress });
    await waitFor(() => {
      expect(result.current.funding.status).toBe("idle");
    });
    await act(async () => {
      gate.resolve(Response.json({}));
      await expect(first).rejects.toThrow("recipient changed");
    });
    expect(result.current.funding.status).toBe("idle");
    refresh.mockRejectedValue(new Error("refresh failed"));
    gate = Promise.withResolvers<Response>();
    let second: Promise<void> | undefined;
    act(() => {
      second = result.current.fund();
    });
    await waitFor(() => {
      expect(bodies).toHaveLength(2);
    });
    await act(async () => {
      gate.resolve(Response.json({}));
      await second;
    });
    await waitFor(() => {
      expect(result.current.funding.status).toBe("success");
    });
    expect(result.current.refreshError).toMatch(/Funding succeeded/);
    expect(bodies).toEqual([
      JSON.stringify({ address: firstAddress }),
      JSON.stringify({ address: secondAddress }),
    ]);
  } finally {
    unmount();
    query.clear();
  }
});
