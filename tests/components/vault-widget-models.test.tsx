import { bytesToHex } from "@sig-net/midnight";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { toast } from "sonner";
import { afterEach, expect, it, type Mock, vi } from "vitest";

import { useMidnightHistory } from "@/hooks/use-midnight-history";
import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import { useVaultLending } from "@/hooks/use-vault-lending";
import { useVaultSwap } from "@/hooks/use-vault-swap";
import { MIDNIGHT_TOKENS, type TokenConfig } from "@/lib/constants/token-metadata";
import {
  AAVE_USDC,
  STATA_USDC,
  stataAssetsPerShare,
  stataSupplyApy,
} from "@/lib/midnight/evm-stata";
import { discoverSwappablePairs, pairKey, quoteBestFeeExactInput } from "@/lib/midnight/evm-swap";
import type { LendingPosition, MidnightTxRecord } from "@/lib/midnight/tx-history";
import { deriveIdentity } from "@/lib/midnight/vault";
import type { VaultBalances } from "@/lib/midnight/vault-balances";
import type { VaultBinding } from "@/lib/midnight/vault-session";
import { RuntimeConfigProvider, useRuntimeConfiguration } from "@/providers/runtime-config-context";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

import {
  mockMatchingRuntimeServer,
  testRuntimeConfiguration,
} from "../config/runtime-server-fixture";
import { createVaultFixture } from "../sdk/vault-fixture";

vi.mock(import("@/hooks/use-midnight-history"), { spy: true });
vi.mock(import("@/hooks/use-midnight-progress"), { spy: true });
vi.mock(import("@/lib/midnight/evm-stata"), { spy: true });
vi.mock(import("@/lib/midnight/evm-swap"), { spy: true });
vi.mock(import("@/providers/vault-balances-context"), { spy: true });
vi.mock(import("@/providers/vault-context"), { spy: true });
vi.mock(import("@/providers/vault-operations-context"), { spy: true });
afterEach(cleanup);

interface WidgetFixture {
  binding: Awaited<ReturnType<typeof createVaultFixture>>;
  balances: VaultBalances;
  query: QueryClient;
  owner: ReturnType<typeof mockMatchingRuntimeServer>;
  first: TokenConfig;
  second: TokenConfig;
  third: TokenConfig;
  swap: Mock<ReturnType<typeof useVaultOperations>["swap"]>;
  supply: Mock<ReturnType<typeof useVaultOperations>["supply"]>;
  redeem: Mock<ReturnType<typeof useVaultOperations>["redeem"]>;
  wrapper: (properties: PropsWithChildren) => React.JSX.Element;
  replace: (binding: VaultBinding | null) => void;
  close: () => Promise<void>;
}

async function fixture(): Promise<WidgetFixture> {
  const binding = await createVaultFixture();
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS", binding.environment.contractAddress);
  vi.stubEnv(
    "NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS",
    binding.environment.signetContractAddress,
  );
  vi.stubEnv("NEXT_PUBLIC_MPC_SECP256K1_PUBKEY", binding.environment.mpcSecpPub);
  const owner = mockMatchingRuntimeServer();
  let current: VaultBinding | null = binding;
  const balances: VaultBalances = { night: 0n, dust: 0n, perToken: {} };
  for (const token of MIDNIGHT_TOKENS)
    balances.perToken[token.erc20Address.toLowerCase()] = {
      decimals: token.erc20Address === STATA_USDC ? 6 : 8,
      vaultUnits: 1_000_000_000n,
      depositUnits: 0n,
      vaultPoolUnits: 0n,
    };
  const swappable = MIDNIGHT_TOKENS.filter((token) => !token.noSwap);
  const [first, second, third] = swappable;
  if (!first || !second || !third)
    throw new Error("Three swap tokens are required for selection races");
  vi.mocked(discoverSwappablePairs).mockResolvedValue(
    new Set(
      swappable.flatMap((a) =>
        swappable.filter((b) => a !== b).map((b) => pairKey(a.erc20Address, b.erc20Address)),
      ),
    ),
  );
  vi.mocked(quoteBestFeeExactInput).mockResolvedValue({ fee: 500n, amountOut: 200_000_000n });
  vi.mocked(stataAssetsPerShare).mockResolvedValue(1.25);
  vi.mocked(stataSupplyApy).mockResolvedValue(0.03);
  vi.mocked(useMidnightHistory).mockReturnValue([]);
  vi.mocked(useMidnightProgress).mockReturnValue({ active: false, message: "", error: null });
  vi.mocked(useVaultBalances).mockReturnValue({
    balances,
    loading: false,
    error: null,
    refresh: vi.fn(),
  });
  vi.mocked(useVault).mockImplementation(() => ({
    status: current ? "ready" : "disconnected",
    error: null,
    binding: current,
    requireBinding: () => {
      if (!current) throw new Error("Disconnected");
      return current;
    },
    retry: vi.fn(),
    rebuild: vi.fn(),
    disconnect: vi.fn(),
  }));
  const swap = vi
    .fn<ReturnType<typeof useVaultOperations>["swap"]>()
    .mockResolvedValue({ refunded: false });
  const supply = vi
    .fn<ReturnType<typeof useVaultOperations>["supply"]>()
    .mockResolvedValue({ refunded: false });
  const redeem = vi
    .fn<ReturnType<typeof useVaultOperations>["redeem"]>()
    .mockResolvedValue({ refunded: false });
  vi.mocked(useVaultOperations).mockReturnValue({
    currentDeposit: null,
    log: [],
    busy: false,
    ready: true,
    unavailable: null,
    deposit: vi.fn(),
    recoverDeposit: vi.fn(),
    withdraw: vi.fn(),
    swap,
    supply,
    redeem,
  });
  const wrapper = ({ children }: PropsWithChildren): React.JSX.Element => (
    <QueryClientProvider client={query}>
      <RuntimeConfigProvider initialConfiguration={testRuntimeConfiguration()}>
        {children}
      </RuntimeConfigProvider>
    </QueryClientProvider>
  );
  return {
    binding,
    balances,
    query,
    owner,
    first,
    second,
    third,
    swap,
    supply,
    redeem,
    wrapper,
    replace: (value: VaultBinding | null): void => {
      current = value;
    },
    close: async (): Promise<void> => {
      cleanup();
      query.clear();
      binding.providers.privateStateProvider.dispose();
      await binding.providers.publicDataProvider.dispose();
      await binding.wallet.disconnect();
    },
  };
}

it.each(["amount", "token", "network", "identity"] as const)(
  "does not publish a delayed swap quote after %s changes",
  async (change) => {
    const f = await fixture();
    const quote = Promise.withResolvers<Awaited<ReturnType<typeof quoteBestFeeExactInput>>>();
    vi.mocked(quoteBestFeeExactInput)
      .mockReturnValueOnce(quote.promise)
      .mockResolvedValue({ fee: 3000n, amountOut: 300_000_000n });
    const hook = renderHook(() => ({ swap: useVaultSwap(), runtime: useRuntimeConfiguration() }), {
      wrapper: f.wrapper,
    });
    try {
      await waitFor(() => {
        expect(hook.result.current.swap.fromTokens.length).toBeGreaterThan(1);
      });
      act(() => {
        hook.result.current.swap.setFromAmount("1");
      });
      await waitFor(() => {
        expect(quoteBestFeeExactInput).toHaveBeenCalled();
      });
      expect(hook.result.current.swap.canSwap).toBe(false);
      expect(hook.result.current.swap.toAmount).toBe("");
      let applied = true;
      act(() => {
        if (change === "amount") hook.result.current.swap.setFromAmount("2");
        if (change === "token") hook.result.current.swap.setToTokenAddress(f.third.erc20Address);
        if (change === "network") {
          hook.result.current.runtime.owner.setEvm("rpcUrl", "https://network.example.invalid");
          applied = true;
        }
        if (change === "identity")
          f.replace({
            ...f.binding,
            sessionId: "replacement",
            identity: deriveIdentity(new Uint8Array(32).fill(8)),
          });
      });
      hook.rerender();
      expect(applied).toBe(true);
      await waitFor(() => {
        expect(hook.result.current.swap.toAmount).toBe("3");
      });
      await act(async () => {
        quote.resolve({ fee: 500n, amountOut: 900_000_000n });
        await quote.promise;
      });
      expect(hook.result.current.swap.toAmount).toBe("3");
      expect(hook.result.current.swap.canSwap).toBe(true);
      await act(async () => {
        await hook.result.current.swap.handleSwap();
      });
      expect(f.swap).toHaveBeenCalledWith(
        hook.result.current.swap.fromSel?.erc20Address,
        hook.result.current.swap.toSel?.erc20Address,
        change === "amount" ? 200_000_000n : 100_000_000n,
        3000n,
        100n,
      );
    } finally {
      await f.close();
    }
  },
);

it.each(
  (["amount", "token", "network", "identity"] as const).flatMap((change) =>
    (["fulfilled", "rejected"] as const).map((outcome) => ({ change, outcome })),
  ),
)(
  "preserves newer swap input after $outcome action and $change change",
  async ({ change, outcome }) => {
    const f = await fixture();
    const completion = Promise.withResolvers<{ refunded: boolean }>();
    f.swap.mockReturnValueOnce(completion.promise);
    const error = vi.spyOn(toast, "error");
    const hook = renderHook(() => ({ swap: useVaultSwap(), runtime: useRuntimeConfiguration() }), {
      wrapper: f.wrapper,
    });
    try {
      await waitFor(() => {
        expect(hook.result.current.swap.fromTokens.length).toBeGreaterThan(1);
      });
      act(() => {
        hook.result.current.swap.setFromAmount("1");
      });
      await waitFor(() => {
        expect(hook.result.current.swap.canSwap).toBe(true);
      });
      let pending: Promise<void> | undefined;
      act(() => {
        pending = hook.result.current.swap.handleSwap();
      });
      expect(f.swap).toHaveBeenCalledTimes(1);
      let applied = true;
      act(() => {
        if (change === "amount") {
          hook.result.current.swap.setFromAmount("2");
          hook.result.current.swap.setFromAmount("1");
        }
        if (change === "token") hook.result.current.swap.setToTokenAddress(f.third.erc20Address);
        if (change === "network") {
          hook.result.current.runtime.owner.setEvm("rpcUrl", "https://other.example.invalid");
          applied = true;
        }
        if (change === "identity")
          f.replace({
            ...f.binding,
            sessionId: "replacement",
            identity: deriveIdentity(new Uint8Array(32).fill(8)),
          });
      });
      hook.rerender();
      expect(applied).toBe(true);
      const value = hook.result.current.swap.fromAmount;
      await act(async () => {
        if (outcome === "rejected") completion.reject(new Error("Stale swap failure"));
        else completion.resolve({ refunded: false });
        await pending;
      });
      expect(hook.result.current.swap.fromAmount).toBe(value);
      expect(error).not.toHaveBeenCalled();
      expect(f.swap).toHaveBeenCalledTimes(1);
    } finally {
      await f.close();
    }
  },
);

it("keeps unavailable balances and invalid precision out of quotes and swap submission", async () => {
  const f = await fixture();
  const hook = renderHook(useVaultSwap, { wrapper: f.wrapper });
  try {
    await waitFor(() => {
      expect(hook.result.current.fromTokens.length).toBeGreaterThan(1);
    });
    for (const amount of ["-1", "0", "1.000000001", "11"]) {
      act(() => {
        hook.result.current.setFromAmount(amount);
      });
      expect(hook.result.current.canSwap).toBe(false);
      await act(async () => {
        await hook.result.current.handleSwap();
      });
    }
    expect(f.swap).not.toHaveBeenCalled();
    const first = f.balances.perToken[f.first.erc20Address.toLowerCase()];
    if (!first) throw new Error("Expected the selected token balance");
    first.vaultUnits = null;
    hook.rerender();
    expect(
      hook.result.current.fromTokens.some((token) => token.erc20Address === f.first.erc20Address),
    ).toBe(false);
    f.replace(null);
    hook.rerender();
    expect(hook.result.current.toAmount).toBe("");
    expect(hook.result.current.fromTokens).toHaveLength(0);
    expect(hook.result.current.canSwap).toBe(false);
  } finally {
    await f.close();
  }
});

it("uses only attributed exact lending legs with unequal decimals and keeps failed rates unavailable", async () => {
  const f = await fixture();
  const share = f.balances.perToken[STATA_USDC.toLowerCase()];
  if (!share) throw new Error("Expected share balance");
  share.vaultUnits = 2_000_000n;
  const applied = f.owner.getSnapshot().applied;
  const position: LendingPosition = {
    deploymentFingerprint: applied.fingerprint,
    commitment: bytesToHex(f.binding.identity.commitment),
    midnightNetwork: applied.midnight.networkId,
    chainId: Number(applied.evm.chainId),
    vaultContract: f.binding.environment.contractAddress,
    assetToken: AAVE_USDC,
    shareToken: STATA_USDC,
    assetDecimals: 8,
    shareDecimals: 6,
  };
  const record: MidnightTxRecord = {
    id: "position",
    type: "Supply",
    status: "completed",
    timestampRaw: 1,
    fromSymbol: "USDC.a",
    fromAmount: "2",
    toSymbol: "stataUSDC",
    toAmount: "2",
    position,
    assetUnits: "200000000",
    shareUnits: "2000000",
  };
  vi.mocked(useMidnightHistory).mockReturnValue([
    record,
    {
      ...record,
      id: "other",
      position: { ...position, commitment: "ff".repeat(32) },
      assetUnits: "99999999999999999999999",
    },
    { ...record, id: "unattributed", position: undefined },
  ]);
  const hook = renderHook(useVaultLending, { wrapper: f.wrapper });
  try {
    await waitFor(() => {
      expect(hook.result.current.positionAssets).toBe(2.5);
    });
    expect(hook.result.current.earnings).toBe(0.5);
    expect(hook.result.current.supplyLabel).toBe("10");
    expect(hook.result.current.redeemLabel).toBe("2");
    f.replace({
      ...f.binding,
      sessionId: "other",
      identity: deriveIdentity(new Uint8Array(32).fill(8)),
    });
    hook.rerender();
    expect(hook.result.current.earnings).toBeNull();
    vi.mocked(stataAssetsPerShare).mockRejectedValue(new Error("RPC unavailable"));
    vi.mocked(stataSupplyApy).mockRejectedValue(new Error("RPC unavailable"));
    await act(async () => {
      await f.query.invalidateQueries({ queryKey: ["vault-lending-rates"] });
    });
    expect(hook.result.current.apy).toBeNull();
    expect(hook.result.current.positionAssets).toBeNull();
    expect(hook.result.current.earnings).toBeNull();
  } finally {
    await f.close();
  }
});

it.each(["supply", "redeem"] as const)(
  "preserves newer %s input and excludes stale success or refund feedback",
  async (kind) => {
    const f = await fixture();
    const completion = Promise.withResolvers<{ refunded: boolean }>();
    f[kind].mockReturnValueOnce(completion.promise);
    const success = vi.spyOn(toast, "success");
    const error = vi.spyOn(toast, "error");
    const hook = renderHook(
      () => ({ lending: useVaultLending(), runtime: useRuntimeConfiguration() }),
      {
        wrapper: f.wrapper,
      },
    );
    try {
      act(() => {
        if (kind === "supply") hook.result.current.lending.setSupplyAmount("1");
        else hook.result.current.lending.setRedeemAmount("1");
      });
      let pending: Promise<void> | undefined;
      act(() => {
        pending =
          kind === "supply"
            ? hook.result.current.lending.runSupply()
            : hook.result.current.lending.runRedeem();
      });
      expect(f[kind]).toHaveBeenCalledWith(kind === "supply" ? 100_000_000n : 1_000_000n);
      act(() => {
        hook.result.current.lending.setSupplyAmount("2");
        hook.result.current.lending.setRedeemAmount("3");
        hook.result.current.runtime.owner.setEvm("rpcUrl", "https://replacement.example.invalid");
        expect(hook.result.current.runtime.owner.getSnapshot().applied.evm.rpcUrl).toBe(
          "https://replacement.example.invalid",
        );
      });
      expect(hook.result.current.lending.disabled).toBe(true);
      await act(async () => {
        completion.resolve({ refunded: false });
        await pending;
      });
      expect(hook.result.current.lending.supplyAmount).toBe("2");
      expect(hook.result.current.lending.redeemAmount).toBe("3");
      expect(success).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      f[kind].mockResolvedValue({ refunded: true });
      await act(async () => {
        if (kind === "supply") await hook.result.current.lending.runSupply();
        else await hook.result.current.lending.runRedeem();
      });
      expect(success).not.toHaveBeenCalled();
      expect(
        kind === "supply"
          ? hook.result.current.lending.supplyAmount
          : hook.result.current.lending.redeemAmount,
      ).toBe("");
    } finally {
      await f.close();
    }
  },
);

it.each([false, true])(
  "clears only current swap input without replacing owner terminal feedback (refunded=%s)",
  async (refunded) => {
    const f = await fixture();
    f.swap.mockResolvedValue({ refunded });
    const success = vi.spyOn(toast, "success");
    const error = vi.spyOn(toast, "error");
    const hook = renderHook(useVaultSwap, { wrapper: f.wrapper });
    try {
      await waitFor(() => {
        expect(hook.result.current.fromTokens.length).toBeGreaterThan(1);
      });
      act(() => {
        hook.result.current.setFromAmount("1");
      });
      await waitFor(() => {
        expect(hook.result.current.canSwap).toBe(true);
      });
      await act(async () => {
        await hook.result.current.handleSwap();
      });
      expect(hook.result.current.fromAmount).toBe("");
      expect(hook.result.current.toAmount).toBe("");
      expect(success).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(f.swap).toHaveBeenCalledTimes(1);
    } finally {
      await f.close();
    }
  },
);

it("ignores a rejected swap completion after its widget unmounts", async () => {
  const f = await fixture();
  const completion = Promise.withResolvers<{ refunded: boolean }>();
  f.swap.mockReturnValueOnce(completion.promise);
  const error = vi.spyOn(toast, "error");
  const hook = renderHook(useVaultSwap, { wrapper: f.wrapper });
  try {
    await waitFor(() => {
      expect(hook.result.current.fromTokens.length).toBeGreaterThan(1);
    });
    act(() => {
      hook.result.current.setFromAmount("1");
    });
    await waitFor(() => {
      expect(hook.result.current.canSwap).toBe(true);
    });
    let pending: Promise<void> | undefined;
    act(() => {
      pending = hook.result.current.handleSwap();
    });
    hook.unmount();
    await act(async () => {
      completion.reject(new Error("Widget closed"));
      await pending;
    });
    expect(error).not.toHaveBeenCalled();
    expect(f.swap).toHaveBeenCalledTimes(1);
  } finally {
    await f.close();
  }
});

it.each(["quote", "discovery"] as const)(
  "exposes %s errors and retries explicitly",
  async (kind) => {
    const f = await fixture();
    const failure = new Error("EVM RPC read timed out");
    if (kind === "quote") vi.mocked(quoteBestFeeExactInput).mockRejectedValueOnce(failure);
    else vi.mocked(discoverSwappablePairs).mockRejectedValueOnce(failure);
    const hook = renderHook(() => useVaultSwap(), { wrapper: f.wrapper });
    try {
      act(() => {
        hook.result.current.setFromAmount("1");
      });
      await waitFor(() => {
        expect(hook.result.current.quoteError).toContain("timed out");
      });
      expect(hook.result.current.canSwap).toBe(false);
      act(() => {
        hook.result.current.retryQuote();
      });
      await waitFor(() => {
        expect(hook.result.current.quoteError).toBeNull();
      });
      if (kind === "discovery")
        act(() => {
          hook.result.current.setFromAmount("1");
        });
      await waitFor(() => {
        expect(hook.result.current.canSwap).toBe(true);
      });
    } finally {
      await f.close();
    }
  },
);
