import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WithdrawToken } from "@/components/withdraw-dialog";
import { WithdrawDialog } from "@/components/withdraw-dialog";
import { AmountInput } from "@/components/withdraw-dialog/amount-input";
import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";
import { RuntimeConfigProvider } from "@/providers/runtime-config-context";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

import { testRuntimeConfiguration } from "../config/runtime-server-fixture";
import { useReadyMidnightFixture } from "./midnight-readiness-fixture";

vi.mock(import("@/hooks/use-midnight-progress"), { spy: true });
vi.mock(import("@/providers/midnight-readiness-context"), { spy: true });
vi.mock(import("@/providers/vault-balances-context"), { spy: true });
vi.mock(import("@/providers/vault-context"), { spy: true });
vi.mock(import("@/providers/vault-operations-context"), { spy: true });

afterEach(cleanup);

const token: WithdrawToken = {
  symbol: "USDC",
  name: "USD Coin",
  chain: "midnight",
  chainName: "Midnight",
  address: "00".repeat(20),
  balance: "2.000000",
  decimals: 6,
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <RuntimeConfigProvider initialConfiguration={testRuntimeConfiguration()}>
        {children}
      </RuntimeConfigProvider>
    </QueryClientProvider>
  );
}

function renderForm(
  onSubmit: (data: { token: WithdrawToken; amount: string; receiverAddress: string }) => void,
  selectedToken: WithdrawToken | null = token,
): void {
  render(
    <AmountInput
      availableTokens={selectedToken ? [selectedToken] : []}
      transactionReady
      onSubmit={onSubmit}
      preSelectedToken={selectedToken}
    />,
    { wrapper: Providers },
  );
}

function enterTransfer(amount: string, receiverAddress: string): void {
  fireEvent.change(screen.getByRole("textbox", { name: "Token amount" }), {
    target: { value: amount },
  });
  fireEvent.change(screen.getByPlaceholderText("Recipient address"), {
    target: { value: receiverAddress },
  });
  fireEvent.click(screen.getByRole("button", { name: /send/i }));
}

describe("withdrawal routing", () => {
  it("routes exact units and closes the exported dialog", async () => {
    const binding = await import("../sdk/vault-fixture").then(({ createVaultFixture }) =>
      createVaultFixture(),
    );
    const withdraw = vi
      .fn<ReturnType<typeof useVaultOperations>["withdraw"]>()
      .mockResolvedValue({ refunded: false });
    const onOpenChange = vi.fn();
    vi.mocked(useMidnightProgress).mockReturnValue({ active: false, message: "", error: null });
    vi.mocked(useMidnightReadiness).mockImplementation(() =>
      useReadyMidnightFixture(binding.wallet),
    );
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
      balances: {
        night: 0n,
        dust: 0n,
        perToken: {
          [token.address.toLowerCase()]: {
            decimals: 6,
            vaultUnits: 2_000_000n,
            depositUnits: 0n,
            vaultPoolUnits: 0n,
          },
        },
      },
      loading: false,
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
      recoverDeposit: vi.fn(),
      withdraw,
      swap: vi.fn(),
      supply: vi.fn(),
      redeem: vi.fn(),
    });
    render(
      <QueryClientProvider client={queryClient}>
        <RuntimeConfigProvider initialConfiguration={testRuntimeConfiguration()}>
          <WithdrawDialog
            open
            onOpenChange={onOpenChange}
            availableTokens={[token]}
            preSelectedToken={token}
          />
        </RuntimeConfigProvider>
      </QueryClientProvider>,
    );
    enterTransfer("1.234567", `0x${"12".repeat(20)}`);
    await waitFor(() => {
      expect(withdraw).toHaveBeenCalledWith(token.address, 1_234_567n, `0x${"12".repeat(20)}`);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    binding.providers.privateStateProvider.dispose();
    await binding.providers.publicDataProvider.dispose();
    await binding.wallet.disconnect();
  });

  it("passes the selected token, exact decimal string and receiver to the operation owner", async () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);
    enterTransfer("1.234567", `0x${"12".repeat(20)}`);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        token,
        amount: "1.234567",
        receiverAddress: `0x${"12".repeat(20)}`,
      });
    });
  });

  it("rejects an amount above the available balance without routing", async () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);
    enterTransfer("2.000001", `0x${"12".repeat(20)}`);

    await waitFor(() => {
      expect(screen.getByText("Amount exceeds available balance")).toBeTruthy();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects excess precision before routing through the exported dialog", async () => {
    const binding = await import("../sdk/vault-fixture").then(({ createVaultFixture }) =>
      createVaultFixture(),
    );
    const withdraw = vi.fn<ReturnType<typeof useVaultOperations>["withdraw"]>();
    const onOpenChange = vi.fn();
    vi.mocked(useMidnightProgress).mockReturnValue({ active: false, message: "", error: null });
    vi.mocked(useMidnightReadiness).mockImplementation(() =>
      useReadyMidnightFixture(binding.wallet),
    );
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
      balances: {
        night: 0n,
        dust: 0n,
        perToken: {
          [token.address.toLowerCase()]: {
            decimals: 6,
            vaultUnits: 2_000_000n,
            depositUnits: 0n,
            vaultPoolUnits: 0n,
          },
        },
      },
      loading: false,
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
      recoverDeposit: vi.fn(),
      withdraw,
      swap: vi.fn(),
      supply: vi.fn(),
      redeem: vi.fn(),
    });
    render(
      <QueryClientProvider client={queryClient}>
        <RuntimeConfigProvider initialConfiguration={testRuntimeConfiguration()}>
          <WithdrawDialog
            open
            onOpenChange={onOpenChange}
            availableTokens={[token]}
            preSelectedToken={token}
          />
        </RuntimeConfigProvider>
      </QueryClientProvider>,
    );
    enterTransfer("1.2345678", `0x${"12".repeat(20)}`);
    await waitFor(() => {
      expect(withdraw).not.toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
    binding.providers.privateStateProvider.dispose();
    await binding.providers.publicDataProvider.dispose();
    await binding.wallet.disconnect();
  });

  it("renders an unavailable token selection without enabling submission", () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit, null);
    expect(screen.getByRole("button", { name: /send/i }).getAttribute("disabled")).toBe("");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
