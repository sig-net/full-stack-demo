import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, type Mock, type MockInstance, vi } from "vitest";

import { createMidnightChainConfig } from "@/lib/config/midnight";
import { deriveAccountKeys } from "@/lib/midnight/seedlib";
import { SeedWallet } from "@/lib/midnight/wallet/SeedWallet";
import { LOCAL_NIGHT_GRANT, MINIMUM_MIDNIGHT_DUST } from "@/lib/wallet-funding";
import {
  MidnightLocalFundingProvider,
  useMidnightLocalFunding,
} from "@/providers/midnight-local-funding-context";
import {
  MidnightReadinessProvider,
  useMidnightReadiness,
} from "@/providers/midnight-readiness-context";
import { useMidnightConnection } from "@/providers/midnight-wallet-context";
import { RuntimeConfigProvider } from "@/providers/runtime-config-context";

import {
  mockMatchingRuntimeServer,
  testRuntimeConfiguration,
} from "../config/runtime-server-fixture";

vi.mock(import("@/providers/midnight-wallet-context"), { spy: true });
afterEach(cleanup);

function fixture(): {
  wallet: SeedWallet;
  dust: MockInstance<SeedWallet["getDustBalance"]>;
  night: MockInstance<SeedWallet["getUnshieldedBalances"]>;
  register: MockInstance<SeedWallet["ensureFeeReady"]>;
  current: Mock<() => boolean>;
  client: QueryClient;
} {
  const configuration = createMidnightChainConfig({});
  const wallet = new SeedWallet(configuration, "07".repeat(32));
  const keys = deriveAccountKeys("07".repeat(32), configuration.networkId);
  const dust = vi.spyOn(wallet, "getDustBalance").mockResolvedValue(MINIMUM_MIDNIGHT_DUST);
  const night = vi.spyOn(wallet, "getUnshieldedBalances").mockResolvedValue({ night: 0n });
  vi.spyOn(wallet, "unshieldedPublicKey", "get").mockReturnValue(
    keys.unshieldedKeystore.getPublicKey(),
  );
  vi.spyOn(wallet, "unshieldedAddress", "get").mockReturnValue("mn_addr_undeployed_test");
  const register = vi.spyOn(wallet, "ensureFeeReady").mockResolvedValue();
  const current = vi.fn(() => true);
  vi.mocked(useMidnightConnection).mockReturnValue({
    wallet,
    session: 1,
    connecting: false,
    error: null,
    syncStatus: "",
    isCurrent: current,
    getGeneration: () => 1,
    installSeedWallet: () => Promise.resolve(wallet),
    installBrowserWallet: () => Promise.resolve(wallet),
    rebuild: () => Promise.resolve(wallet),
    disconnect: vi.fn(),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return { wallet, dust, night, register, current, client };
}

it("observes and checks fee readiness without runtime or local funding providers and requests", async () => {
  const f = fixture();
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("Unexpected funding request"));
  vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(useMidnightReadiness, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={f.client}>
        <MidnightReadinessProvider>{children}</MidnightReadinessProvider>
      </QueryClientProvider>
    ),
  });
  try {
    await waitFor(() => {
      expect(hook.result.current.ready).toBe(true);
    });
    await hook.result.current.requireReady();
    f.dust.mockResolvedValue(0n);
    await expect(hook.result.current.requireReady()).rejects.toThrow(
      "below the transaction threshold",
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(f.register).not.toHaveBeenCalled();
  } finally {
    hook.unmount();
    f.client.clear();
    await f.wallet.disconnect();
  }
});

it.each([false, true])(
  "deduplicates funding across consumers and rejects stale sessions (stale=%s)",
  async (stale) => {
    const f = fixture();
    mockMatchingRuntimeServer();
    const runtimeFetch = globalThis.fetch;
    const gate = Promise.withResolvers<Response>();
    const post = vi.fn(() => gate.promise);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input, init) => {
        if (input === "/api/local-funding/evm")
          return Promise.resolve(Response.json({ eligible: true }));
        if (input === "/api/local-funding/midnight" && init?.method === "POST") return post();
        return runtimeFetch(input, init);
      }),
    );
    const hook = renderHook(
      () => ({ first: useMidnightLocalFunding(), second: useMidnightLocalFunding() }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={f.client}>
            <RuntimeConfigProvider initialConfiguration={testRuntimeConfiguration()}>
              <MidnightReadinessProvider>
                <MidnightLocalFundingProvider>{children}</MidnightLocalFundingProvider>
              </MidnightReadinessProvider>
            </RuntimeConfigProvider>
          </QueryClientProvider>
        ),
      },
    );
    try {
      await waitFor(() => {
        expect(hook.result.current.first.fundingUnavailable).toBeUndefined();
      });
      let operation: Promise<void> = Promise.resolve();
      act(() => {
        operation = hook.result.current.first.fund();
        expect(hook.result.current.second.fund()).toBe(operation);
      });
      await waitFor(() => {
        expect(post).toHaveBeenCalledTimes(1);
      });
      if (stale) f.current.mockReturnValue(false);
      const outcome = operation.then(
        () => null,
        (error: unknown) => {
          if (!(error instanceof Error)) throw error;
          return error.message;
        },
      );
      await act(async () => {
        gate.resolve(Response.json({ success: true }));
        expect(await outcome).toBe(stale ? "Wallet session changed." : null);
      });
      expect(f.register).toHaveBeenCalledTimes(stale ? 0 : 1);
      f.current.mockReturnValue(true);
      f.night.mockResolvedValue({ night: LOCAL_NIGHT_GRANT });
      f.dust.mockRejectedValue(new Error("Readiness refresh unavailable"));
      await act(async () => {
        await expect(hook.result.current.first.fund()).rejects.toThrow(
          "Readiness refresh unavailable",
        );
      });
      expect(post).toHaveBeenCalledTimes(1);
      expect(f.register).toHaveBeenCalledTimes(stale ? 1 : 2);
      await waitFor(() => {
        expect(hook.result.current.first.funding.error?.message).toBe(
          "Readiness refresh unavailable",
        );
      });
    } finally {
      hook.unmount();
      f.client.clear();
      await f.wallet.disconnect();
    }
  },
);
