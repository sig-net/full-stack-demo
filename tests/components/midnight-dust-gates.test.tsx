import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, expect, it, type MockInstance, vi } from "vitest";

import { LendWidget } from "@/components/lend-widget";
import { SwapWidget } from "@/components/swap-widget";
import { WithdrawDialog, type WithdrawToken } from "@/components/withdraw-dialog";
import { useMidnightHistory } from "@/hooks/use-midnight-history";
import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import { useVaultGasReserves } from "@/hooks/use-vault-gas-reserves";
import { NETWORK_DEFAULTS } from "@/lib/config/runtime";
import { MIDNIGHT_TOKENS } from "@/lib/constants/token-metadata";
import { describeDustGate, type DustGateKind } from "@/lib/midnight/dust-gate";
import {
  AAVE_USDC,
  STATA_USDC,
  stataAssetsPerShare,
  stataSupplyApy,
} from "@/lib/midnight/evm-stata";
import { discoverSwappablePairs, pairKey, quoteBestFeeExactInput } from "@/lib/midnight/evm-swap";
import { flow } from "@/lib/midnight/flow";
import * as vault from "@/lib/midnight/vault";
import type { VaultBalances } from "@/lib/midnight/vault-balances";
import { SeedWallet } from "@/lib/midnight/wallet/SeedWallet";
import type { Wallet } from "@/lib/midnight/wallet/Wallet";
import { LOCAL_NIGHT_GRANT, MINIMUM_MIDNIGHT_DUST } from "@/lib/wallet-funding";
import { ConfigurationProvider } from "@/providers/configuration-context";
import {
  MidnightReadinessProvider,
  useMidnightReadiness,
} from "@/providers/midnight-readiness-context";
import { useMidnightConnection } from "@/providers/midnight-wallet-context";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations, VaultOperationsProvider } from "@/providers/vault-operations-context";

import {
  mockMatchingRuntimeServer,
  testRuntimeConfiguration,
} from "../config/runtime-server-fixture";
import { createVaultFixture } from "../sdk/vault-fixture";
import { progressState } from "./midnight-progress-fixture";
import { vaultGasReservesFixture } from "./vault-gas-fixture";

vi.mock(import("@/hooks/use-midnight-history"), { spy: true });
vi.mock(import("@/hooks/use-midnight-progress"), { spy: true });
vi.mock(import("@/hooks/use-vault-gas-reserves"), { spy: true });
vi.mock(import("@/lib/midnight/evm-stata"), { spy: true });
vi.mock(import("@/lib/midnight/evm-swap"), { spy: true });
vi.mock(import("@/lib/midnight/vault"), { spy: true });
vi.mock(import("@/providers/midnight-readiness-context"), { spy: true });
vi.mock(import("@/providers/midnight-wallet-context"), { spy: true });
vi.mock(import("@/providers/vault-balances-context"), { spy: true });
vi.mock(import("@/providers/vault-context"), { spy: true });
beforeEach(() => {
  vi.mocked(useVaultGasReserves).mockReturnValue(vaultGasReservesFixture());
});

afterEach(() => {
  cleanup();
  flow.reset();
});

const REGISTER_ACTION = "Register NIGHT for DUST";
const REFRESH_ACTION = "Refresh wallet readiness";
const REGISTER_REASON = "NIGHT in this wallet is not registered for DUST generation.";
const THRESHOLD_MESSAGE = "below the transaction threshold";

/** Balances a controlled readiness session publishes to the operation consumers. */
interface ObservedBalances {
  dust: bigint;
  night: bigint;
  unregisteredNight: bigint | undefined;
}

interface ReadinessFixture {
  wallet: SeedWallet;
  dustRead: MockInstance<SeedWallet["getDustBalance"]>;
  current: { value: boolean };
  client: QueryClient;
}

function connectedFixture(dust: bigint): ReadinessFixture {
  const wallet = new SeedWallet(NETWORK_DEFAULTS.midnight.undeployed, "07".repeat(32));
  const dustRead = vi.spyOn(wallet, "getDustBalance").mockResolvedValue(dust);
  vi.spyOn(wallet, "getUnshieldedBalances").mockResolvedValue({ night: LOCAL_NIGHT_GRANT });
  vi.spyOn(wallet, "getUnregisteredNightBalance").mockResolvedValue(0n);
  vi.spyOn(wallet, "registerNightForDust").mockResolvedValue();
  const current = { value: true };
  vi.mocked(useMidnightConnection).mockReturnValue({
    addresses: null,
    wallet,
    session: 1,
    connecting: false,
    error: null,
    syncStatus: "",
    isCurrent: () => current.value,
    getGeneration: () => 1,
    installSeedWallet: () => Promise.resolve(wallet),
    installBrowserWallet: () => Promise.resolve(wallet),
    rebuild: () => Promise.resolve(wallet),
    disconnect: vi.fn(),
  });
  return {
    wallet,
    dustRead,
    current,
    client: new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    }),
  };
}

function readinessWrapper(
  client: QueryClient,
): (properties: { children: React.ReactNode }) => React.JSX.Element {
  return function ProvidedReadiness({ children }): React.JSX.Element {
    return (
      <QueryClientProvider client={client}>
        <MidnightReadinessProvider>{children}</MidnightReadinessProvider>
      </QueryClientProvider>
    );
  };
}

const feeStates: { name: string; dust: bigint; ready: boolean }[] = [
  { name: "zero DUST", dust: 0n, ready: false },
  { name: "one unit below the threshold", dust: MINIMUM_MIDNIGHT_DUST - 1n, ready: false },
  { name: "exactly the threshold", dust: MINIMUM_MIDNIGHT_DUST, ready: true },
];

it.each(feeStates)(
  "publishes readiness $ready for $name and agrees with the fresh submission check",
  async ({ dust, ready }) => {
    const f = connectedFixture(dust);
    const hook = renderHook(useMidnightReadiness, { wrapper: readinessWrapper(f.client) });
    try {
      await waitFor(() => {
        expect(hook.result.current.balances.isSuccess).toBe(true);
      });
      expect(hook.result.current.ready).toBe(ready);
      const fresh = await hook.result.current
        .requireReady()
        .then(() => "permitted")
        .catch((error: unknown) => (error instanceof Error ? error.message : "unknown failure"));
      expect(fresh).toContain(ready ? "permitted" : THRESHOLD_MESSAGE);
    } finally {
      hook.unmount();
      f.client.clear();
      await f.wallet.disconnect();
    }
  },
);

it("keeps readiness unavailable when the fee balance read fails", async () => {
  const f = connectedFixture(0n);
  f.dustRead.mockRejectedValue(new Error("Indexer unavailable."));
  const hook = renderHook(useMidnightReadiness, { wrapper: readinessWrapper(f.client) });
  try {
    await waitFor(() => {
      expect(hook.result.current.balances.isError).toBe(true);
    });
    expect(hook.result.current.ready).toBe(false);
    expect(hook.result.current.balances.data).toBeUndefined();
    await expect(hook.result.current.requireReady()).rejects.toThrow("Indexer unavailable.");
  } finally {
    hook.unmount();
    f.client.clear();
    await f.wallet.disconnect();
  }
});

it("keeps operations blocked while registration is pending and until DUST is observed", async () => {
  const f = connectedFixture(0n);
  vi.spyOn(f.wallet, "getUnregisteredNightBalance").mockResolvedValue(LOCAL_NIGHT_GRANT);
  const settlement = Promise.withResolvers<undefined>();
  vi.spyOn(f.wallet, "registerNightForDust").mockImplementation(() =>
    settlement.promise.then(() => undefined),
  );
  const hook = renderHook(useMidnightReadiness, { wrapper: readinessWrapper(f.client) });
  try {
    await waitFor(() => {
      expect(hook.result.current.balances.data?.unregisteredNight).toBe(LOCAL_NIGHT_GRANT);
    });
    let registration: Promise<void> | undefined;
    act(() => {
      registration = hook.result.current.registerNight();
    });
    await waitFor(() => {
      expect(hook.result.current.registration.isPending).toBe(true);
    });
    expect(hook.result.current.ready).toBe(false);
    await expect(hook.result.current.requireReady()).rejects.toThrow(THRESHOLD_MESSAGE);
    vi.spyOn(f.wallet, "getUnregisteredNightBalance").mockResolvedValue(0n);
    await act(async () => {
      settlement.resolve(undefined);
      await registration;
    });
    await waitFor(() => {
      expect(hook.result.current.balances.data).toEqual({
        dust: 0n,
        night: LOCAL_NIGHT_GRANT,
        unregisteredNight: 0n,
      });
    });
    expect(hook.result.current.ready).toBe(false);
    await expect(hook.result.current.requireReady()).rejects.toThrow(THRESHOLD_MESSAGE);
    f.dustRead.mockResolvedValue(MINIMUM_MIDNIGHT_DUST);
    await act(async () => {
      await hook.result.current.balances.refetch();
    });
    await waitFor(() => {
      expect(hook.result.current.ready).toBe(true);
    });
  } finally {
    hook.unmount();
    f.client.clear();
    await f.wallet.disconnect();
  }
});

it("rejects a fresh submission check after DUST is depleted behind a ready render", async () => {
  const f = connectedFixture(MINIMUM_MIDNIGHT_DUST);
  const hook = renderHook(useMidnightReadiness, { wrapper: readinessWrapper(f.client) });
  try {
    await waitFor(() => {
      expect(hook.result.current.ready).toBe(true);
    });
    f.dustRead.mockResolvedValue(0n);
    expect(hook.result.current.ready).toBe(true);
    await expect(hook.result.current.requireReady()).rejects.toThrow(THRESHOLD_MESSAGE);
    await act(async () => {
      await hook.result.current.balances.refetch();
    });
    await waitFor(() => {
      expect(hook.result.current.ready).toBe(false);
    });
  } finally {
    hook.unmount();
    f.client.clear();
    await f.wallet.disconnect();
  }
});

it("rejects a fresh submission check for a replaced wallet session", async () => {
  const f = connectedFixture(MINIMUM_MIDNIGHT_DUST);
  const hook = renderHook(useMidnightReadiness, { wrapper: readinessWrapper(f.client) });
  try {
    await waitFor(() => {
      expect(hook.result.current.ready).toBe(true);
    });
    f.dustRead.mockImplementation(() => {
      f.current.value = false;
      return Promise.resolve(MINIMUM_MIDNIGHT_DUST);
    });
    await expect(hook.result.current.requireReady()).rejects.toThrow("Wallet session changed.");
  } finally {
    hook.unmount();
    f.client.clear();
    await f.wallet.disconnect();
  }
});

function useControlledReadiness(
  wallet: Wallet,
  observed: { current: ObservedBalances },
): ReturnType<typeof useMidnightReadiness> {
  const registration = useMutation({ mutationFn: (): Promise<void> => Promise.resolve() });
  const balances = useQuery({
    queryKey: ["dust-gate-fixture", observed.current.dust.toString()],
    queryFn: () => Promise.resolve(observed.current),
    initialData: observed.current,
    enabled: false,
  });
  const ready = observed.current.dust >= MINIMUM_MIDNIGHT_DUST;
  return {
    wallet,
    balances,
    ready,
    resourcesReady: ready,
    transactionUnavailable: undefined,
    registrationUnavailable: undefined,
    registration,
    registerNight: () => registration.mutateAsync(),
    requireReady: () =>
      ready
        ? Promise.resolve()
        : Promise.reject(
            new Error(
              "Midnight DUST is below the transaction threshold. Fund the wallet or retry readiness.",
            ),
          ),
  };
}

const withdrawToken: WithdrawToken = {
  symbol: "USDC",
  name: "USD Coin",
  chain: "midnight",
  chainName: "Midnight",
  address: AAVE_USDC,
  balance: "2.000000",
  decimals: 6,
};

const funded: ObservedBalances = {
  dust: MINIMUM_MIDNIGHT_DUST,
  night: LOCAL_NIGHT_GRANT,
  unregisteredNight: LOCAL_NIGHT_GRANT,
};

interface OperationSurface {
  observed: { current: ObservedBalances };
  deplete: (balances: ObservedBalances) => void;
  close: () => Promise<void>;
}

async function mountSurface(content: React.ReactNode): Promise<OperationSurface> {
  const binding = await createVaultFixture();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS", binding.environment.contractAddress);
  vi.stubEnv(
    "NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS",
    binding.environment.signetContractAddress,
  );
  vi.stubEnv("NEXT_PUBLIC_MPC_SECP256K1_PUBKEY", binding.environment.mpcSecpPub);
  mockMatchingRuntimeServer();
  const balances: VaultBalances = { night: 0n, dust: 0n, perToken: {} };
  for (const token of MIDNIGHT_TOKENS)
    balances.perToken[token.erc20Address.toLowerCase()] = {
      decimals: 6,
      vaultUnits: 1_000_000_000n,
      depositUnits: 0n,
      vaultPoolUnits: 0n,
    };
  const swappable = MIDNIGHT_TOKENS.filter((token) => !token.noSwap);
  vi.mocked(discoverSwappablePairs).mockResolvedValue(
    new Set(
      swappable.flatMap((a) =>
        swappable.filter((b) => a !== b).map((b) => pairKey(a.erc20Address, b.erc20Address)),
      ),
    ),
  );
  vi.mocked(quoteBestFeeExactInput).mockResolvedValue({ fee: 500n, amountOut: 200_000_000n });
  vi.mocked(stataAssetsPerShare).mockResolvedValue(1);
  vi.mocked(stataSupplyApy).mockResolvedValue(0.03);
  vi.mocked(useMidnightHistory).mockReturnValue([]);
  vi.mocked(useMidnightProgress).mockReturnValue(progressState());
  vi.mocked(useVault).mockReturnValue({
    status: "ready",
    error: null,
    binding,
    requireBinding: () => binding,
    retry: vi.fn(),
    rebuild: vi.fn(),
    disconnect: vi.fn(),
  });
  vi.mocked(useVaultBalances).mockReturnValue({
    balances,
    loading: false,
    checkedAt: null,
    error: null,
    refresh: vi.fn(),
  });
  const observed = { current: funded };
  vi.mocked(useMidnightReadiness).mockImplementation(function useObservedReadiness() {
    return useControlledReadiness(binding.wallet, observed);
  });
  const tree = (): React.JSX.Element => (
    <QueryClientProvider client={client}>
      <ConfigurationProvider initialConfiguration={testRuntimeConfiguration()}>
        <VaultOperationsProvider>{content}</VaultOperationsProvider>
      </ConfigurationProvider>
    </QueryClientProvider>
  );
  const mounted = render(tree());
  return {
    observed,
    deplete: (next) => {
      observed.current = next;
      act(() => {
        mounted.rerender(tree());
      });
    },
    close: async () => {
      cleanup();
      client.clear();
      binding.providers.privateStateProvider.dispose();
      await binding.providers.publicDataProvider.dispose();
      await binding.wallet.disconnect();
    },
  };
}

const depletedAndUnregistered: ObservedBalances = {
  dust: MINIMUM_MIDNIGHT_DUST - 1n,
  night: LOCAL_NIGHT_GRANT,
  unregisteredNight: LOCAL_NIGHT_GRANT,
};

it("blocks swap, supply and redeem on DUST alone and names the registration next step", async () => {
  const surface = await mountSurface(
    <>
      <SwapWidget />
      <LendWidget />
    </>,
  );
  try {
    const swapButton = await screen.findByRole("button", { name: "Swap" });
    const supplyButton = screen.getByRole("button", { name: "Supply" });
    const redeemButton = screen.getByRole("button", { name: "Redeem" });
    const [swapAmount] = screen.getAllByRole("textbox", { name: "Token amount" });
    if (!swapAmount) throw new Error("Expected the swap amount input");
    fireEvent.change(swapAmount, { target: { value: "1" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Supply amount" }), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Redeem amount" }), {
      target: { value: "1" },
    });
    await waitFor(() => {
      expect(swapButton).toHaveProperty("disabled", false);
    });
    expect(supplyButton).toHaveProperty("disabled", false);
    expect(redeemButton).toHaveProperty("disabled", false);
    expect(
      screen.queryByRole("status", { name: "Midnight fee readiness for swapping" }),
    ).toBeNull();
    expect(screen.queryByRole("status", { name: "Midnight fee readiness for lending" })).toBeNull();

    surface.deplete(depletedAndUnregistered);

    for (const control of [swapButton, supplyButton, redeemButton])
      expect(control).toHaveProperty("disabled", true);
    expect(screen.getAllByRole("textbox", { name: "Supply amount" })[0]).toHaveProperty(
      "value",
      "1",
    );
    const panels = [
      screen.getByRole("status", { name: "Midnight fee readiness for swapping" }),
      screen.getByRole("status", { name: "Midnight fee readiness for lending" }),
    ];
    for (const panel of panels) {
      expect(within(panel).getByText(REGISTER_REASON)).toBeTruthy();
      expect(
        within(panel).getByText("Register NIGHT for DUST generation with your connected wallet."),
      ).toBeTruthy();
      expect(within(panel).getByRole("button", { name: REGISTER_ACTION })).toBeTruthy();
    }
    expect(swapButton.getAttribute("aria-describedby")).toBe("swap-dust-gate");
    expect(supplyButton.getAttribute("aria-describedby")).toBe("lending-dust-gate");
    expect(redeemButton.getAttribute("aria-describedby")).toBe("lending-dust-gate");
    expect(panels.map((panel) => panel.getAttribute("id"))).toEqual([
      "swap-dust-gate",
      "lending-dust-gate",
    ]);
  } finally {
    await surface.close();
  }
});

it("blocks the withdrawal submission on DUST alone and names the registration next step", async () => {
  const surface = await mountSurface(
    <WithdrawDialog
      open
      onOpenChange={vi.fn()}
      availableTokens={[withdrawToken]}
      preSelectedToken={withdrawToken}
    />,
  );
  try {
    fireEvent.change(screen.getByRole("textbox", { name: "Token amount" }), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Recipient address"), {
      target: { value: `0x${"12".repeat(20)}` },
    });
    const send = screen.getByRole("button", { name: /send/i });
    await waitFor(() => {
      expect(send).toHaveProperty("disabled", false);
    });
    expect(screen.queryByRole("status", { name: "Midnight fee readiness for sending" })).toBeNull();
    expect(send.getAttribute("aria-describedby")).toBeNull();

    surface.deplete(depletedAndUnregistered);

    expect(send).toHaveProperty("disabled", true);
    expect(send.getAttribute("aria-describedby")).toBe("withdraw-dust-gate");
    const panel = screen.getByRole("status", { name: "Midnight fee readiness for sending" });
    expect(panel.getAttribute("id")).toBe("withdraw-dust-gate");
    expect(within(panel).getByText(REGISTER_REASON)).toBeTruthy();
    expect(within(panel).getByRole("button", { name: REGISTER_ACTION })).toBeTruthy();
  } finally {
    await surface.close();
  }
});

it("offers a balance recheck while registered NIGHT is still generating DUST", async () => {
  const surface = await mountSurface(<LendWidget />);
  try {
    surface.deplete({ dust: 0n, night: LOCAL_NIGHT_GRANT, unregisteredNight: 0n });
    const panel = screen.getByRole("status", { name: "Midnight fee readiness for lending" });
    expect(
      within(panel).getByText("Registered NIGHT has not generated spendable DUST yet."),
    ).toBeTruthy();
    expect(within(panel).getByRole("button", { name: REFRESH_ACTION })).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: REGISTER_ACTION })).toBeNull();
  } finally {
    await surface.close();
  }
});

it("keeps the controls usable when unregistered NIGHT coexists with sufficient DUST", async () => {
  const surface = await mountSurface(<LendWidget />);
  try {
    expect(surface.observed.current.unregisteredNight).toBe(LOCAL_NIGHT_GRANT);
    expect(screen.queryByRole("status", { name: "Midnight fee readiness for lending" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Supply amount" }), {
      target: { value: "1" },
    });
    expect(screen.getByRole("button", { name: "Supply" })).toHaveProperty("disabled", false);
  } finally {
    await surface.close();
  }
});

const operationCalls: {
  name: "withdraw" | "swap" | "supply" | "redeem";
  sdk: "runWithdraw" | "runSwap" | "runSupply" | "runRedeem";
}[] = [
  { name: "withdraw", sdk: "runWithdraw" },
  { name: "swap", sdk: "runSwap" },
  { name: "supply", sdk: "runSupply" },
  { name: "redeem", sdk: "runRedeem" },
];

it.each(operationCalls)(
  "rejects $name before the SDK when the fresh readiness check fails",
  async ({ name, sdk }) => {
    const binding = await createVaultFixture();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS", binding.environment.contractAddress);
    vi.stubEnv(
      "NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS",
      binding.environment.signetContractAddress,
    );
    vi.stubEnv("NEXT_PUBLIC_MPC_SECP256K1_PUBKEY", binding.environment.mpcSecpPub);
    mockMatchingRuntimeServer();
    vi.mocked(useVault).mockReturnValue({
      status: "ready",
      error: null,
      binding,
      requireBinding: () => binding,
      retry: vi.fn(),
      rebuild: vi.fn(),
      disconnect: vi.fn(),
    });
    vi.mocked(useVaultBalances).mockReturnValue({
      balances: null,
      loading: false,
      checkedAt: null,
      error: null,
      refresh: vi.fn(),
    });
    const depleted = new Error(
      "Midnight DUST is below the transaction threshold. Fund the wallet or retry readiness.",
    );
    const observed = { current: funded };
    vi.mocked(useMidnightReadiness).mockImplementation(function useStaleReadiness() {
      return {
        ...useControlledReadiness(binding.wallet, observed),
        requireReady: () => Promise.reject(depleted),
      };
    });
    const sdkCall = vi.mocked(vault[sdk]);
    const hook = renderHook(useVaultOperations, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>
          <ConfigurationProvider initialConfiguration={testRuntimeConfiguration()}>
            <VaultOperationsProvider>{children}</VaultOperationsProvider>
          </ConfigurationProvider>
        </QueryClientProvider>
      ),
    });
    try {
      expect(hook.result.current.ready).toBe(true);
      await act(async () => {
        const attempt =
          name === "withdraw"
            ? hook.result.current.withdraw(AAVE_USDC, 1n)
            : name === "swap"
              ? hook.result.current.swap(AAVE_USDC, STATA_USDC, 1n)
              : name === "supply"
                ? hook.result.current.supply(1n)
                : hook.result.current.redeem(1n);
        await expect(attempt).rejects.toThrow(THRESHOLD_MESSAGE);
      });
      expect(sdkCall).not.toHaveBeenCalled();
      expect(hook.result.current.busy).toBe(false);
      expect(flow.error).toContain(THRESHOLD_MESSAGE);
      await act(async () => {
        await expect(hook.result.current.withdraw(AAVE_USDC, 1n)).rejects.toThrow(
          THRESHOLD_MESSAGE,
        );
      });
      expect(hook.result.current.busy).toBe(false);
      expect(sdkCall).not.toHaveBeenCalled();
    } finally {
      hook.unmount();
      client.clear();
      binding.providers.privateStateProvider.dispose();
      await binding.providers.publicDataProvider.dispose();
      await binding.wallet.disconnect();
    }
  },
);

const NO_NIGHT_REASON = "This wallet holds no NIGHT, so it generates no DUST.";
const GENERATING_REASON = "Registered NIGHT has not generated spendable DUST yet.";
const THRESHOLD_REASON = "Spendable DUST is below the Midnight transaction threshold.";
const CONNECTOR_LIMIT = "This wallet registers NIGHT in its own settings.";

const gateCases: {
  name: string;
  input: Parameters<typeof describeDustGate>[0];
  kind: DustGateKind | null;
  offer: "registration" | "refresh" | null;
  tone: "neutral" | "warning" | "error" | null;
  reason: string | null;
}[] = [
  {
    name: "no connected wallet",
    input: {
      connected: false,
      transactionUnavailable: undefined,
      registrationUnavailable: undefined,
      canRegister: true,
      balances: undefined,
      balancesFailed: false,
      registering: false,
      registrationError: undefined,
    },
    kind: null,
    offer: null,
    tone: null,
    reason: null,
  },
  {
    name: "a connector without transaction support",
    input: {
      connected: true,
      transactionUnavailable: "This wallet cannot submit Midnight transactions.",
      registrationUnavailable: undefined,
      canRegister: false,
      balances: { dust: MINIMUM_MIDNIGHT_DUST, night: 1n, unregisteredNight: 0n },
      balancesFailed: false,
      registering: false,
      registrationError: undefined,
    },
    kind: "transactions-unavailable",
    offer: null,
    tone: "error",
    reason: "This wallet cannot submit Midnight transactions.",
  },
  {
    name: "a failed balance read",
    input: {
      connected: true,
      transactionUnavailable: undefined,
      registrationUnavailable: undefined,
      canRegister: true,
      balances: undefined,
      balancesFailed: true,
      registering: false,
      registrationError: undefined,
    },
    kind: "balance-unavailable",
    offer: "refresh",
    tone: "error",
    reason: "Midnight fee balances could not be read.",
  },
  {
    name: "a balance read in flight",
    input: {
      connected: true,
      transactionUnavailable: undefined,
      registrationUnavailable: undefined,
      canRegister: true,
      balances: undefined,
      balancesFailed: false,
      registering: false,
      registrationError: undefined,
    },
    kind: "checking",
    offer: null,
    tone: "neutral",
    reason: "Checking Midnight fee balances.",
  },
  {
    name: "unregistered NIGHT alongside sufficient DUST",
    input: {
      connected: true,
      transactionUnavailable: undefined,
      registrationUnavailable: undefined,
      canRegister: true,
      balances: { dust: MINIMUM_MIDNIGHT_DUST, night: 5n, unregisteredNight: 5n },
      balancesFailed: false,
      registering: false,
      registrationError: undefined,
    },
    kind: null,
    offer: null,
    tone: null,
    reason: null,
  },
  {
    name: "a pending registration",
    input: {
      connected: true,
      transactionUnavailable: undefined,
      registrationUnavailable: undefined,
      canRegister: true,
      balances: { dust: 0n, night: 5n, unregisteredNight: 5n },
      balancesFailed: false,
      registering: true,
      registrationError: undefined,
    },
    kind: "registering",
    offer: null,
    tone: "neutral",
    reason: "NIGHT registration for DUST generation is in progress.",
  },
  {
    name: "a failed registration",
    input: {
      connected: true,
      transactionUnavailable: undefined,
      registrationUnavailable: undefined,
      canRegister: true,
      balances: { dust: 0n, night: 5n, unregisteredNight: 5n },
      balancesFailed: false,
      registering: false,
      registrationError: "Registration transaction failed.",
    },
    kind: "registration-failed",
    offer: "registration",
    tone: "error",
    reason: "Registration transaction failed.",
  },
  {
    name: "unregistered NIGHT in a registering wallet",
    input: {
      connected: true,
      transactionUnavailable: undefined,
      registrationUnavailable: undefined,
      canRegister: true,
      balances: { dust: 0n, night: 5n, unregisteredNight: 5n },
      balancesFailed: false,
      registering: false,
      registrationError: undefined,
    },
    kind: "register-night",
    offer: "registration",
    tone: "warning",
    reason: REGISTER_REASON,
  },
  {
    name: "unregistered NIGHT in a connector without registration",
    input: {
      connected: true,
      transactionUnavailable: undefined,
      registrationUnavailable: CONNECTOR_LIMIT,
      canRegister: false,
      balances: { dust: 0n, night: 5n, unregisteredNight: 5n },
      balancesFailed: false,
      registering: false,
      registrationError: undefined,
    },
    kind: "register-night",
    offer: null,
    tone: "warning",
    reason: REGISTER_REASON,
  },
  {
    name: "a wallet holding no NIGHT",
    input: {
      connected: true,
      transactionUnavailable: undefined,
      registrationUnavailable: undefined,
      canRegister: true,
      balances: { dust: 0n, night: 0n, unregisteredNight: 0n },
      balancesFailed: false,
      registering: false,
      registrationError: undefined,
    },
    kind: "receive-night",
    offer: "refresh",
    tone: "warning",
    reason: NO_NIGHT_REASON,
  },
  {
    name: "registered NIGHT that has generated nothing yet",
    input: {
      connected: true,
      transactionUnavailable: undefined,
      registrationUnavailable: undefined,
      canRegister: true,
      balances: { dust: 0n, night: 5n, unregisteredNight: 0n },
      balancesFailed: false,
      registering: false,
      registrationError: undefined,
    },
    kind: "generating-dust",
    offer: "refresh",
    tone: "neutral",
    reason: GENERATING_REASON,
  },
  {
    name: "DUST below the threshold",
    input: {
      connected: true,
      transactionUnavailable: undefined,
      registrationUnavailable: undefined,
      canRegister: true,
      balances: { dust: MINIMUM_MIDNIGHT_DUST - 1n, night: 5n, unregisteredNight: 0n },
      balancesFailed: false,
      registering: false,
      registrationError: undefined,
    },
    kind: "insufficient-dust",
    offer: "refresh",
    tone: "warning",
    reason: THRESHOLD_REASON,
  },
];

/** Listing every kind here keeps a new blocking condition from entering the UI untested. */
const requiredKinds: Record<DustGateKind, true> = {
  "transactions-unavailable": true,
  "balance-unavailable": true,
  checking: true,
  registering: true,
  "registration-failed": true,
  "register-night": true,
  "receive-night": true,
  "generating-dust": true,
  "insufficient-dust": true,
};

it("covers a non-empty inventory of readiness states, operations and every gate kind", () => {
  expect(feeStates.length).toBeGreaterThan(0);
  expect(operationCalls.length).toBeGreaterThan(0);
  expect(gateCases.length).toBeGreaterThan(0);
  const covered = new Set<string>(gateCases.map((entry) => entry.kind ?? "none"));
  expect(Object.keys(requiredKinds).filter((kind) => !covered.has(kind))).toEqual([]);
});

it.each(gateCases)("describes $name as $kind", ({ input, kind, offer, tone, reason }) => {
  const gate = describeDustGate(input);
  expect({
    kind: gate?.kind ?? null,
    offer: gate?.offer ?? null,
    tone: gate?.tone ?? null,
    reason: gate?.reason ?? null,
    actionable: (gate?.nextAction ?? "").length > 0,
  }).toEqual({ kind, offer, tone, reason, actionable: kind !== null });
});

it("gives a connector without registration support its own wallet-specific guidance", () => {
  const limited = gateCases.find((entry) => entry.input.registrationUnavailable !== undefined);
  if (!limited) throw new Error("Expected a connector case without registration support");
  expect(describeDustGate(limited.input)?.nextAction).toBe(CONNECTOR_LIMIT);
});
