import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { EvmDepositAddress } from "@/components/deposit-dialog/evm-deposit-address";
import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import { useVaultGasReserves } from "@/hooks/use-vault-gas-reserves";
import {
  MIDNIGHT_TOKENS,
  NETWORKS_WITH_TOKENS,
  type TokenConfig,
} from "@/lib/constants/token-metadata";
import type { PendingDepositRequest } from "@/lib/midnight/deposit-sweep";
import { MPC_OPERATION_ETH_RESERVE } from "@/lib/midnight/evm-envelope";
import { flow } from "@/lib/midnight/flow";
import * as vault from "@/lib/midnight/vault";
import type { VaultBalances } from "@/lib/midnight/vault-balances";
import { EvmBalancesProvider } from "@/providers/evm-balances-context";
import { EvmLocalFundingProvider } from "@/providers/evm-local-funding-context";
import { EvmWalletProvider } from "@/providers/evm-wallet-context";
import { LocalFaucetProvider } from "@/providers/local-faucet-context";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";
import { RuntimeConfigProvider } from "@/providers/runtime-config-context";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";
import { VaultOperationsProvider } from "@/providers/vault-operations-context";

import { LOCAL_FAUCET_DESCRIPTOR_FIXTURE } from "../config/local-faucet-fixture";
import {
  mockMatchingRuntimeServer,
  testRuntimeConfiguration,
} from "../config/runtime-server-fixture";
import { createVaultFixture } from "../sdk/vault-fixture";
import { progressState } from "./midnight-progress-fixture";
import { useReadyMidnightFixture } from "./midnight-readiness-fixture";
import { vaultGasReservesFixture } from "./vault-gas-fixture";

vi.mock(import("@/hooks/use-midnight-progress"), { spy: true });
vi.mock(import("@/hooks/use-vault-gas-reserves"), { spy: true });
vi.mock(import("@/lib/midnight/vault"), { spy: true });
vi.mock(import("@/providers/midnight-readiness-context"), { spy: true });
vi.mock(import("@/providers/vault-balances-context"), { spy: true });
vi.mock(import("@/providers/vault-context"), { spy: true });
vi.mock(import("@/components/ui/qr-code"), () => ({
  QRCode: () => <div data-slot="qr-code" />,
}));

const GATE_LABEL = "Deposit from address availability";
const GATE_ID = "deposit-address-continue-gate";
const CONTINUE = "I've sent the tokens";
const HELD_UNITS = 10_000_000n;
const CHECKED_AT = 1_700_000_000_000;

afterEach(() => {
  cleanup();
  flow.reset();
});

beforeEach(() => {
  vi.mocked(useVaultGasReserves).mockReturnValue(vaultGasReservesFixture());
  vi.mocked(useMidnightProgress).mockReturnValue(progressState());
});

interface SweepSurfaceInput {
  depositUnits?: bigint | null;
  decimals?: number | null;
  balanceError?: string | null;
  loading?: boolean;
  pendingRequests?: PendingDepositRequest[];
  pendingFails?: boolean;
}

interface SweepSurface {
  token: TokenConfig;
  started: ReturnType<typeof vi.fn<(units: bigint) => void>>;
  refreshed: ReturnType<typeof vi.fn<() => Promise<void>>>;
  rerender: () => void;
  close: () => Promise<void>;
}

async function mountSweepSurface(input: SweepSurfaceInput = {}): Promise<SweepSurface> {
  const binding = await createVaultFixture();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const token = MIDNIGHT_TOKENS[0];
  const network = NETWORKS_WITH_TOKENS.find((entry) => entry.chain === "ethereum");
  if (!token || !network) throw new Error("Expected a supported EVM deposit token");
  const decimals = input.decimals === undefined ? 6 : input.decimals;
  const depositUnits = input.depositUnits === undefined ? HELD_UNITS : input.depositUnits;
  const balances: VaultBalances = {
    night: 0n,
    dust: 0n,
    perToken: {
      [token.erc20Address.toLowerCase()]: {
        decimals,
        vaultUnits: 0n,
        depositUnits,
        vaultPoolUnits: 0n,
      },
    },
  };
  const refreshed = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
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
    loading: input.loading ?? false,
    checkedAt: CHECKED_AT,
    error: input.balanceError ?? null,
    refresh: refreshed,
  });
  vi.mocked(useMidnightReadiness).mockImplementation(function useFixtureReadiness() {
    return useReadyMidnightFixture(binding.wallet);
  });
  vi.mocked(vault.readPendingDeposits).mockImplementation(() =>
    input.pendingFails
      ? Promise.reject(new Error("Ledger read failed."))
      : Promise.resolve(input.pendingRequests ?? []),
  );
  mockMatchingRuntimeServer();
  const started = vi.fn<(units: bigint) => void>();
  const tree = (): React.JSX.Element => (
    <QueryClientProvider client={client}>
      <RuntimeConfigProvider initialConfiguration={testRuntimeConfiguration()}>
        <LocalFaucetProvider descriptor={LOCAL_FAUCET_DESCRIPTOR_FIXTURE}>
          <EvmWalletProvider>
            <EvmBalancesProvider tokens={[]}>
              <EvmLocalFundingProvider>
                <VaultOperationsProvider>
                  <EvmDepositAddress
                    token={token}
                    network={network}
                    depositAddress={binding.depositAddress}
                    isSubmitting={false}
                    showContinue
                    onStartDeposit={started}
                  />
                </VaultOperationsProvider>
              </EvmLocalFundingProvider>
            </EvmBalancesProvider>
          </EvmWalletProvider>
        </LocalFaucetProvider>
      </RuntimeConfigProvider>
    </QueryClientProvider>
  );
  const mounted = render(tree());
  await waitFor(() => {
    expect(screen.getByRole("button", { name: CONTINUE })).toBeTruthy();
  });
  return {
    token,
    started,
    refreshed,
    rerender: () => {
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

it("starts a sweep for a partial amount of the observed deposit address balance", async () => {
  const surface = await mountSweepSurface();
  try {
    expect(screen.getByText("Unswept balance: 10 USDC")).toBeTruthy();
    expect(screen.getByText(/^Last checked /)).toBeTruthy();
    const amount = screen.getByLabelText(`Amount to deposit (${surface.token.symbol})`);
    const start = screen.getByRole("button", { name: CONTINUE });
    expect(start).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Max" }));
    expect(amount).toHaveProperty("value", "10");

    fireEvent.change(amount, { target: { value: "3" } });
    await waitFor(() => {
      expect(start).toHaveProperty("disabled", false);
    });
    expect(screen.queryByRole("status", { name: GATE_LABEL })).toBeNull();
    expect(start.getAttribute("aria-describedby")).toBeNull();

    fireEvent.click(start);
    expect(surface.started.mock.calls).toEqual([[3_000_000n]]);
  } finally {
    await surface.close();
  }
});

it.each([
  ["0.0000001", "at most 6 decimal places"],
  ["10.000001", "does not hold that much"],
  ["-1", "at most 6 decimal places"],
])("refuses the amount %s before any conversion", async (entered, expected) => {
  const surface = await mountSweepSurface();
  try {
    const amount = screen.getByLabelText(`Amount to deposit (${surface.token.symbol})`);
    const start = screen.getByRole("button", { name: CONTINUE });
    fireEvent.change(amount, { target: { value: entered } });
    await waitFor(() => {
      expect(start).toHaveProperty("disabled", true);
    });
    expect(start.getAttribute("aria-describedby")).toBe(GATE_ID);
    expect(
      within(screen.getByRole("alert", { name: GATE_LABEL })).getByText(expected, { exact: false }),
    ).toBeTruthy();
    expect(amount).toHaveProperty("value", entered);
    expect(surface.started).not.toHaveBeenCalled();
  } finally {
    await surface.close();
  }
});

it("names an empty deposit address without offering a maximum", async () => {
  const surface = await mountSweepSurface({ depositUnits: 0n });
  try {
    expect(screen.getByText("Unswept balance: 0 USDC")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Max" })).toHaveProperty("disabled", true);
    const start = screen.getByRole("button", { name: CONTINUE });
    expect(start).toHaveProperty("disabled", true);
    expect(start.getAttribute("aria-describedby")).toBe(GATE_ID);
    expect(
      within(screen.getByRole("status", { name: GATE_LABEL })).getByText(/holds no USDC/),
    ).toBeTruthy();
    expect(surface.started).not.toHaveBeenCalled();
  } finally {
    await surface.close();
  }
});

it.each([
  ["a failed balance read", { balanceError: "Balance refresh failed." }],
  ["an unavailable token precision", { decimals: null }],
])("keeps %s unavailable with null units", async (_case, input) => {
  const surface = await mountSweepSurface(input);
  try {
    expect(screen.getByText("Unswept balance: unavailable")).toBeTruthy();
    const start = screen.getByRole("button", { name: CONTINUE });
    expect(start).toHaveProperty("disabled", true);
    expect(
      within(screen.getByRole("alert", { name: GATE_LABEL })).getByText(/could not be read/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Max" })).toHaveProperty("disabled", true);
  } finally {
    await surface.close();
  }
});

it("refuses a second sweep while a pending request claims the address's next nonce", async () => {
  const requestId = "ab".repeat(32);
  const surface = await mountSweepSurface({
    pendingRequests: [{ requestId, units: 4_000_000n }],
  });
  try {
    await waitFor(() => {
      expect(screen.getByRole("status", { name: GATE_LABEL })).toBeTruthy();
    });
    expect(screen.getByText("Pending deposit requests")).toBeTruthy();
    expect(screen.getByText("4 USDC")).toBeTruthy();
    expect(screen.getByLabelText("Copy Pending deposit request ID")).toBeTruthy();
    const amount = screen.getByLabelText(`Amount to deposit (${surface.token.symbol})`);
    fireEvent.change(amount, { target: { value: "3" } });
    const start = screen.getByRole("button", { name: CONTINUE });
    await waitFor(() => {
      expect(start).toHaveProperty("disabled", true);
    });
    expect(start.getAttribute("aria-describedby")).toBe(GATE_ID);
    expect(
      within(screen.getByRole("status", { name: GATE_LABEL })).getByText(/still pending/),
    ).toBeTruthy();
    fireEvent.click(start);
    expect(surface.started).not.toHaveBeenCalled();
  } finally {
    await surface.close();
  }
});

it("blocks the sweep on an unreadable pending-request view", async () => {
  const surface = await mountSweepSurface({ pendingFails: true });
  try {
    await waitFor(() => {
      expect(
        within(screen.getByRole("alert", { name: GATE_LABEL })).getByText(
          /Pending deposit requests for this identity could not be read/,
        ),
      ).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: CONTINUE })).toHaveProperty("disabled", true);
    expect(surface.started).not.toHaveBeenCalled();
  } finally {
    await surface.close();
  }
});

it("blocks the sweep on a deposit address that cannot pay for it", async () => {
  const surface = await mountSweepSurface();
  try {
    const amount = screen.getByLabelText(`Amount to deposit (${surface.token.symbol})`);
    fireEvent.change(amount, { target: { value: "3" } });
    const start = screen.getByRole("button", { name: CONTINUE });
    await waitFor(() => {
      expect(start).toHaveProperty("disabled", false);
    });

    vi.mocked(useVaultGasReserves).mockReturnValue(
      vaultGasReservesFixture({ deposit: MPC_OPERATION_ETH_RESERVE.deposit - 1n }),
    );
    surface.rerender();

    expect(start).toHaveProperty("disabled", true);
    expect(start.getAttribute("aria-describedby")).toBe(GATE_ID);
    const panel = screen.getByRole("status", { name: GATE_LABEL });
    expect(within(panel).getByText(/below the reserve needed/)).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Refresh ETH balance" })).toBeTruthy();
    expect(amount).toHaveProperty("value", "3");
    expect(surface.started).not.toHaveBeenCalled();
  } finally {
    await surface.close();
  }
});

it("blocks the sweep while another vault operation owns the connection", async () => {
  const surface = await mountSweepSurface();
  try {
    const amount = screen.getByLabelText(`Amount to deposit (${surface.token.symbol})`);
    fireEvent.change(amount, { target: { value: "3" } });
    vi.mocked(useMidnightProgress).mockReturnValue(
      progressState({ active: true, message: "Proving…" }),
    );
    surface.rerender();
    const start = screen.getByRole("button", { name: CONTINUE });
    expect(start).toHaveProperty("disabled", true);
    expect(
      within(screen.getByRole("status", { name: GATE_LABEL })).getByText(
        /Another vault operation owns the Midnight connection/,
      ),
    ).toBeTruthy();
    expect(amount).toHaveProperty("value", "3");
  } finally {
    await surface.close();
  }
});

it("refreshes the observed balance and the pending requests together", async () => {
  const surface = await mountSweepSurface();
  try {
    await waitFor(() => {
      expect(vi.mocked(vault.readPendingDeposits)).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh deposit address balance" }));
    await waitFor(() => {
      expect(surface.refreshed).toHaveBeenCalledTimes(1);
      expect(vi.mocked(vault.readPendingDeposits)).toHaveBeenCalledTimes(2);
    });
  } finally {
    await surface.close();
  }
});
