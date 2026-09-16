import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, type MockInstance, vi } from "vitest";

import { NETWORK_DEFAULTS } from "@/lib/config/runtime";
import { SeedWallet } from "@/lib/midnight/wallet/SeedWallet";
import { LOCAL_NIGHT_GRANT, MINIMUM_MIDNIGHT_DUST } from "@/lib/wallet-funding";
import { ConfigurationProvider, useConfiguration } from "@/providers/configuration-context";
import {
  MidnightLocalFundingProvider,
  useMidnightLocalFunding,
} from "@/providers/midnight-local-funding-context";
import {
  MidnightReadinessProvider,
  useMidnightReadiness,
} from "@/providers/midnight-readiness-context";
import { useMidnightConnection } from "@/providers/midnight-wallet-context";

import { LOCAL_FAUCET_DESCRIPTOR_FIXTURE } from "../config/local-faucet-fixture";
import { testRuntimeConfiguration } from "../config/runtime-server-fixture";

vi.mock(import("@/providers/midnight-wallet-context"), { spy: true });
afterEach(cleanup);

function fixture(): {
  wallet: SeedWallet;
  register: MockInstance<SeedWallet["registerNightForDust"]>;
  client: QueryClient;
} {
  const wallet = new SeedWallet(NETWORK_DEFAULTS.midnight.undeployed, "07".repeat(32));
  vi.spyOn(wallet, "getDustBalance").mockResolvedValue(MINIMUM_MIDNIGHT_DUST);
  vi.spyOn(wallet, "getUnshieldedBalances").mockResolvedValue({ night: LOCAL_NIGHT_GRANT });
  vi.spyOn(wallet, "getUnregisteredNightBalance").mockResolvedValue(LOCAL_NIGHT_GRANT);
  vi.spyOn(wallet, "unshieldedAddress", "get").mockReturnValue("mn_addr_undeployed_test");
  const register = vi.spyOn(wallet, "registerNightForDust").mockResolvedValue();
  vi.mocked(useMidnightConnection).mockReturnValue({
    addresses: null,
    wallet,
    session: 1,
    connecting: false,
    error: null,
    syncStatus: "",
    isCurrent: () => true,
    getGeneration: () => 1,
    installSeedWallet: () => Promise.resolve(wallet),
    installBrowserWallet: () => Promise.resolve(wallet),
    rebuild: () => Promise.resolve(wallet),
    disconnect: vi.fn(),
  });
  return {
    wallet,
    register,
    client: new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    }),
  };
}

function FixtureProviders({
  children,
  client,
}: {
  children: React.ReactNode;
  client: QueryClient;
}): React.JSX.Element {
  return (
    <QueryClientProvider client={client}>
      <ConfigurationProvider
        localFaucet={LOCAL_FAUCET_DESCRIPTOR_FIXTURE}
        initialConfiguration={testRuntimeConfiguration()}
      >
        <MidnightReadinessProvider>{children}</MidnightReadinessProvider>
      </ConfigurationProvider>
    </QueryClientProvider>
  );
}

it("reports unregistered NIGHT separately from DUST readiness", async () => {
  const f = fixture();
  const hook = renderHook(useMidnightReadiness, {
    wrapper: ({ children }) => <FixtureProviders client={f.client}>{children}</FixtureProviders>,
  });
  try {
    await waitFor(() => {
      expect(hook.result.current.ready).toBe(true);
      expect(hook.result.current.balances.data?.unregisteredNight).toBe(LOCAL_NIGHT_GRANT);
    });
  } finally {
    hook.unmount();
    f.client.clear();
    await f.wallet.disconnect();
  }
});

it("funds NIGHT without registering it", async () => {
  const f = fixture();
  vi.spyOn(f.wallet, "getUnshieldedBalances").mockResolvedValue({ night: 0n });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ hash: "test" }));
  vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(useMidnightLocalFunding, {
    wrapper: ({ children }) => (
      <FixtureProviders client={f.client}>
        <MidnightLocalFundingProvider>{children}</MidnightLocalFundingProvider>
      </FixtureProviders>
    ),
  });
  try {
    await act(async () => {
      await hook.result.current.fund();
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/midnight/night-faucet",
      expect.objectContaining({ method: "POST" }),
    );
    expect(f.register).not.toHaveBeenCalled();
  } finally {
    hook.unmount();
    f.client.clear();
    await f.wallet.disconnect();
  }
});

it("registers NIGHT only after an explicit user action", async () => {
  const f = fixture();
  const hook = renderHook(useMidnightReadiness, {
    wrapper: ({ children }) => <FixtureProviders client={f.client}>{children}</FixtureProviders>,
  });
  try {
    await waitFor(() => {
      expect(hook.result.current.balances.isSuccess).toBe(true);
    });
    await act(async () => {
      await hook.result.current.registerNight();
    });
    expect(f.register).toHaveBeenCalledWith(MINIMUM_MIDNIGHT_DUST);
  } finally {
    hook.unmount();
    f.client.clear();
    await f.wallet.disconnect();
  }
});

it("does not call the NIGHT faucet after configuration changes during the balance read", async () => {
  const f = fixture();
  const hook = renderHook(
    () => ({ funding: useMidnightLocalFunding(), runtime: useConfiguration() }),
    {
      wrapper: ({ children }) => (
        <FixtureProviders client={f.client}>
          <MidnightLocalFundingProvider>{children}</MidnightLocalFundingProvider>
        </FixtureProviders>
      ),
    },
  );
  const read = Promise.withResolvers<Record<string, bigint>>();
  const entered = Promise.withResolvers<undefined>();
  vi.spyOn(f.wallet, "getUnshieldedBalances").mockImplementationOnce(() => {
    entered.resolve(undefined);
    return read.promise;
  });
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
  try {
    const attempt = hook.result.current.funding.fund().catch((error: unknown) => error);
    await entered.promise;
    act(() => {
      hook.result.current.runtime.owner.setMidnight("networkId", "stagenet");
    });
    read.resolve({ night: 0n });
    await expect(attempt).resolves.toBeInstanceOf(Error);
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    hook.unmount();
    f.client.clear();
    vi.unstubAllGlobals();
    await f.wallet.disconnect();
  }
});
