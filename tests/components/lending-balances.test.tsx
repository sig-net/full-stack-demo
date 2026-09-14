import { readFile } from "node:fs/promises";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { BalanceSection } from "@/components/balance-section";
import { LendWidget } from "@/components/lend-widget";
import { useVaultGasReserves } from "@/hooks/use-vault-gas-reserves";
import { MPC_OPERATION_ETH_RESERVE } from "@/lib/midnight/evm-envelope";
import {
  AAVE_USDC,
  STATA_USDC,
  stataAssetsPerShare,
  stataSupplyApy,
} from "@/lib/midnight/evm-stata";
import type { VaultBalances } from "@/lib/midnight/vault-balances";
import { EvmBalancesProvider } from "@/providers/evm-balances-context";
import { EvmLocalFundingProvider } from "@/providers/evm-local-funding-context";
import { EvmWalletProvider } from "@/providers/evm-wallet-context";
import { LocalFaucetProvider } from "@/providers/local-faucet-context";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";
import { useMidnightConnection } from "@/providers/midnight-wallet-context";
import { RuntimeConfigProvider } from "@/providers/runtime-config-context";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

import { LOCAL_FAUCET_DESCRIPTOR_FIXTURE } from "../config/local-faucet-fixture";
import {
  mockMatchingRuntimeServer,
  testRuntimeConfiguration,
} from "../config/runtime-server-fixture";
import { createVaultFixture } from "../sdk/vault-fixture";
import { useReadyMidnightFixture } from "./midnight-readiness-fixture";
import { vaultGasReservesFixture } from "./vault-gas-fixture";

vi.mock(import("@/hooks/use-vault-gas-reserves"), { spy: true });
vi.mock(import("@/providers/midnight-readiness-context"), { spy: true });
vi.mock(import("@/providers/midnight-wallet-context"), { spy: true });
vi.mock(import("@/providers/vault-balances-context"), { spy: true });
vi.mock(import("@/providers/vault-context"), { spy: true });
vi.mock(import("@/providers/vault-operations-context"), { spy: true });
vi.mock(import("@/lib/midnight/evm-stata"), { spy: true });
vi.mock(import("@/components/deposit-dialog"), () => ({ DepositDialog: () => <div /> }));
beforeEach(() => {
  vi.mocked(useVaultGasReserves).mockReturnValue(vaultGasReservesFixture());
});
afterEach(cleanup);

it.each(["missing", "loading", "error"])(
  "distinguishes %s balances from an empty portfolio",
  (mode) => {
    vi.mocked(useVault).mockReturnValue({
      status: "missing-identity",
      error: null,
      binding: null,
      requireBinding: vi.fn(),
      retry: vi.fn(),
      rebuild: vi.fn(),
      disconnect: vi.fn(),
    });
    vi.mocked(useMidnightConnection).mockReturnValue({
      addresses: null,
      wallet: null,
      connecting: false,
      error: null,
      syncStatus: "",
      session: 1,
      isCurrent: () => false,
      getGeneration: () => 1,
      installSeedWallet: vi.fn(),
      installBrowserWallet: vi.fn(),
      rebuild: vi.fn(),
      disconnect: vi.fn(),
    });
    vi.mocked(useVaultBalances).mockReturnValue({
      balances: null,
      loading: mode === "loading",
      checkedAt: null,
      error: mode === "error" ? "Some balances are unavailable." : null,
      refresh: vi.fn(),
    });
    render(<BalanceSection />);
    expect(screen.queryByText("No tokens found")).toBeNull();
    expect(
      screen.getByText(
        mode === "missing"
          ? "Set a vault identity"
          : mode === "loading"
            ? "Loading balances"
            : "Balances unavailable",
      ),
    ).toBeTruthy();
  },
);

it("uses asset decimals, preserves refunds, rejects excess precision and gates unavailable supply", async () => {
  const binding = await createVaultFixture();
  const query = new QueryClient();
  mockMatchingRuntimeServer();
  vi.mocked(stataAssetsPerShare).mockResolvedValue(1);
  vi.mocked(stataSupplyApy).mockResolvedValue(0.03);
  vi.mocked(useVault).mockReturnValue({
    status: "ready",
    error: null,
    binding,
    requireBinding: () => binding,
    retry: vi.fn(),
    rebuild: vi.fn(),
    disconnect: vi.fn(),
  });
  const balances: VaultBalances = {
    night: 0n,
    dust: 0n,
    perToken: {
      [AAVE_USDC.toLowerCase()]: {
        decimals: 8,
        vaultUnits: 100000000n,
        depositUnits: 0n,
        vaultPoolUnits: 0n,
      },
      [STATA_USDC.toLowerCase()]: {
        decimals: 6,
        vaultUnits: 1000000n,
        depositUnits: 0n,
        vaultPoolUnits: 0n,
      },
    },
  };
  vi.mocked(useVaultBalances).mockReturnValue({
    balances,
    loading: false,
    checkedAt: null,
    error: null,
    refresh: vi.fn(),
  });
  let refunded = true;
  const supply = vi.fn<ReturnType<typeof useVaultOperations>["supply"]>(() =>
    Promise.resolve({ refunded }),
  );
  vi.mocked(useVaultOperations).mockReturnValue({
    currentDeposit: null,
    log: [],
    busy: false,
    ready: true,
    unavailable: null,
    deposit: vi.fn(),
    lookupDepositRequest: vi.fn(),
    recoverDeposit: vi.fn(),
    withdraw: vi.fn(),
    swap: vi.fn(),
    supply,
    redeem: vi.fn(),
  });
  vi.mocked(useMidnightReadiness).mockImplementation(() => useReadyMidnightFixture(binding.wallet));
  const success = vi.spyOn(toast, "success");
  const error = vi.spyOn(toast, "error");
  const { rerender, unmount } = render(<LendWidget />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={query}>
        <RuntimeConfigProvider initialConfiguration={testRuntimeConfiguration()}>
          {children}
        </RuntimeConfigProvider>
      </QueryClientProvider>
    ),
  });
  try {
    const input = screen.getByRole("textbox", { name: "Supply amount" });
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Supply" }));
    await waitFor(() => {
      expect(supply).toHaveBeenCalledWith(100000000n);
      expect(input).toHaveProperty("value", "");
    });
    expect(success).not.toHaveBeenCalled();
    refunded = false;
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Supply" }));
    await waitFor(() => {
      expect(success).toHaveBeenCalledTimes(1);
    });
    fireEvent.change(input, { target: { value: "1.000000001" } });
    fireEvent.click(screen.getByRole("button", { name: "Supply" }));
    expect(supply).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(1);
    const asset = balances.perToken[AAVE_USDC.toLowerCase()];
    if (!asset) throw new Error("Expected the supplied asset balance");
    asset.vaultUnits = null;
    rerender(<LendWidget />);
    expect(screen.getByRole("button", { name: "Supply" })).toHaveProperty("disabled", true);
  } finally {
    unmount();
    query.clear();
    binding.providers.privateStateProvider.dispose();
    await binding.providers.publicDataProvider.dispose();
    await binding.wallet.disconnect();
  }
});

it("blocks supply on a vault reserve that still covers redeem", async () => {
  const binding = await createVaultFixture();
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS", binding.environment.contractAddress);
  vi.stubEnv(
    "NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS",
    binding.environment.signetContractAddress,
  );
  vi.stubEnv("NEXT_PUBLIC_MPC_SECP256K1_PUBKEY", binding.environment.mpcSecpPub);
  mockMatchingRuntimeServer();
  vi.mocked(stataAssetsPerShare).mockResolvedValue(1);
  vi.mocked(stataSupplyApy).mockResolvedValue(0.03);
  vi.mocked(useVault).mockReturnValue({
    status: "ready",
    error: null,
    binding,
    requireBinding: () => binding,
    retry: vi.fn(),
    rebuild: vi.fn(),
    disconnect: vi.fn(),
  });
  const balances: VaultBalances = {
    night: 0n,
    dust: 0n,
    perToken: {
      [AAVE_USDC.toLowerCase()]: {
        decimals: 6,
        vaultUnits: 100000000n,
        depositUnits: 0n,
        vaultPoolUnits: 0n,
      },
      [STATA_USDC.toLowerCase()]: {
        decimals: 6,
        vaultUnits: 100000000n,
        depositUnits: 0n,
        vaultPoolUnits: 0n,
      },
    },
  };
  vi.mocked(useVaultBalances).mockReturnValue({
    balances,
    loading: false,
    checkedAt: null,
    error: null,
    refresh: vi.fn(),
  });
  vi.mocked(useVaultOperations).mockReturnValue({
    currentDeposit: null,
    log: [],
    busy: false,
    ready: true,
    unavailable: null,
    deposit: vi.fn(),
    lookupDepositRequest: vi.fn(),
    recoverDeposit: vi.fn(),
    withdraw: vi.fn(),
    swap: vi.fn(),
    supply: vi.fn(),
    redeem: vi.fn(),
  });
  vi.mocked(useMidnightReadiness).mockImplementation(() => useReadyMidnightFixture(binding.wallet));
  // Above the stata envelope that a redemption needs, below the envelope plus the one-time
  // wrapper approval that a first supply needs.
  vi.mocked(useVaultGasReserves).mockReturnValue(
    vaultGasReservesFixture({ vault: MPC_OPERATION_ETH_RESERVE.supply - 1n }),
  );
  const { unmount } = render(<LendWidget />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={query}>
        <RuntimeConfigProvider initialConfiguration={testRuntimeConfiguration()}>
          <LocalFaucetProvider descriptor={LOCAL_FAUCET_DESCRIPTOR_FIXTURE}>
            <EvmWalletProvider>
              <EvmBalancesProvider tokens={[]}>
                <EvmLocalFundingProvider>{children}</EvmLocalFundingProvider>
              </EvmBalancesProvider>
            </EvmWalletProvider>
          </LocalFaucetProvider>
        </RuntimeConfigProvider>
      </QueryClientProvider>
    ),
  });
  try {
    fireEvent.change(screen.getByRole("textbox", { name: "Supply amount" }), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Redeem amount" }), {
      target: { value: "1" },
    });
    const supplyButton = screen.getByRole("button", { name: "Supply" });
    const redeemButton = screen.getByRole("button", { name: "Redeem" });
    await waitFor(() => {
      expect(redeemButton).toHaveProperty("disabled", false);
    });
    expect(supplyButton).toHaveProperty("disabled", true);
    expect(supplyButton.getAttribute("aria-describedby")).toBe("supply-vault-gas-gate");
    expect(redeemButton.getAttribute("aria-describedby")).toBeNull();
    const panel = screen.getByRole("status", { name: "Vault ETH reserve for supplying" });
    expect(panel.textContent).toContain("below the reserve needed");
    expect(screen.queryByRole("status", { name: "Vault ETH reserve for redeeming" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Supply amount" })).toHaveProperty("value", "1");
  } finally {
    unmount();
    query.clear();
    binding.providers.privateStateProvider.dispose();
    await binding.providers.publicDataProvider.dispose();
    await binding.wallet.disconnect();
  }
});

it("keeps balance and operation consumers on their separate ownership APIs", async () => {
  const paths = [
    "src/providers/vault-operations-context.tsx",
    "src/providers/vault-balances-context.tsx",
    "src/lib/midnight/vault-balances.ts",
    "src/components/lend-widget/index.tsx",
    "src/components/swap-widget/index.tsx",
    "src/hooks/use-vault-swap.ts",
    "src/hooks/use-vault-lending.ts",
    "src/components/withdraw-dialog/index.tsx",
    "src/components/deposit-dialog/index.tsx",
  ];
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) {
    const source = await readFile(path, "utf8");
    expect(source.length).toBeGreaterThan(0);
    expect(source).not.toMatch(
      /useMidnightWallet|midnight-context|useMemo|useCallback|React\.memo|\?\? 6|decimals = 18/,
    );
  }
  await expect(readFile("src/providers/midnight-context.tsx")).rejects.toMatchObject({
    code: "ENOENT",
  });
});
