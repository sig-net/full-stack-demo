import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

import Home from "@/app/page";
import { BalanceSection } from "@/components/balance-section";
import { useMidnightTransactions } from "@/hooks/use-midnight-transactions";
import { MIDNIGHT_TOKENS } from "@/lib/constants/token-metadata";
import { queryClient } from "@/lib/query-client";
import { useMidnightConnection } from "@/providers/midnight-wallet-context";
import { Providers } from "@/providers/providers";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";

import { LOCAL_FAUCET_DESCRIPTOR_FIXTURE } from "../config/local-faucet-fixture";

vi.mock(import("@/providers/midnight-wallet-context"), { spy: true });
vi.mock(import("@/providers/vault-balances-context"), { spy: true });
vi.mock(import("@/providers/vault-context"), { spy: true });
vi.mock(import("@/hooks/use-midnight-transactions"), { spy: true });
afterEach(() => {
  cleanup();
  queryClient.clear();
});

it("renders the non-zero USDC balance using six asset decimals", () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const token = MIDNIGHT_TOKENS.find((entry) => entry.symbol === "USDC");
  if (!token) throw new Error("Expected the USDC Midnight token");
  vi.mocked(useVault).mockReturnValue({
    status: "ready",
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
    balances: {
      night: 0n,
      dust: 0n,
      perToken: {
        [token.erc20Address.toLowerCase()]: {
          decimals: 6,
          vaultUnits: 123450000n,
          depositUnits: 0n,
          vaultPoolUnits: 0n,
        },
      },
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  });
  render(
    <Providers localFaucet={LOCAL_FAUCET_DESCRIPTOR_FIXTURE}>
      <BalanceSection />
    </Providers>,
  );
  expect(screen.getByText("123.45")).toBeTruthy();
  expect(screen.getByText("USDC")).toBeTruthy();
});

it("renders the connected Home sections and refunded activity on the server", async () => {
  const token = MIDNIGHT_TOKENS.find((entry) => entry.symbol === "USDC");
  if (!token) throw new Error("Expected the USDC Midnight token");
  const { createVaultFixture } = await import("../sdk/vault-fixture");
  const binding = await createVaultFixture();
  vi.mocked(useVault).mockReturnValue({
    status: "ready",
    error: null,
    binding,
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
    balances: {
      night: 0n,
      dust: 0n,
      perToken: {
        [token.erc20Address.toLowerCase()]: {
          decimals: 6,
          vaultUnits: 123450000n,
          depositUnits: 0n,
          vaultPoolUnits: 0n,
        },
      },
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  });
  vi.mocked(useMidnightTransactions).mockReturnValue([
    {
      id: "home-refunded",
      type: "Supply",
      timestamp: "fixture",
      status: "refunded",
      explorer: {
        transaction: { status: "unavailable", reason: "No settled EVM transaction is recorded." },
        fromAddress: { status: "unavailable", reason: "No counterparty address is recorded." },
        toAddress: { status: "unavailable", reason: "No counterparty address is recorded." },
        vaultContract: { status: "unavailable", reason: "No vault contract is recorded." },
      },
    },
  ]);
  try {
    const html = renderToStaticMarkup(
      <Providers localFaucet={LOCAL_FAUCET_DESCRIPTOR_FIXTURE}>
        <Home />
      </Providers>,
    );
    expect(html).toContain("Activity");
    expect(html).toContain("Balances");
    expect(html).toContain("Swap");
    expect(html).toContain("Supply USDC");
    expect(html).toContain("Refunded");
    expect(html).not.toMatch(/Solana|solscan|tx-status|tx-list/);
  } finally {
    queryClient.clear();
    binding.providers.privateStateProvider.dispose();
    await binding.providers.publicDataProvider.dispose();
    await binding.wallet.disconnect();
  }
});

it("orders the five activation rows and keeps identity outside the wallet menu", () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.mocked(useVault).mockReturnValue({
    status: "disconnected",
    error: null,
    binding: null,
    requireBinding: vi.fn(),
    retry: vi.fn(),
    rebuild: vi.fn(),
    disconnect: vi.fn(),
  });
  render(
    <Providers localFaucet={LOCAL_FAUCET_DESCRIPTOR_FIXTURE}>
      <Home />
    </Providers>,
  );
  const heading = screen.getByRole("heading", { name: "To activate the dApp" });
  const rows = Array.from(heading.parentElement?.children ?? []);
  expect(rows).toHaveLength(5);
  expect(rows.map((row) => row.textContent)).toEqual([
    "To activate the dApp",
    "1. Connect a Midnight and EVM wallet",
    "MidnightEVM",
    "2. Set a vault identity",
    "Vault identity",
  ]);
  const toolbar = within(screen.getByRole("banner"));
  expect(toolbar.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(
    [
      "Vault identity: not set",
      "Midnight wallet: not connected",
      "EVM wallet: not connected",
      "Configuration",
    ],
  );
  fireEvent.pointerDown(toolbar.getByRole("button", { name: "Midnight wallet: not connected" }), {
    button: 0,
  });
  expect(within(screen.getByRole("menu")).queryByText("Vault identity")).toBeNull();
});

it("returns home activation focus to the persistent identity control as the dashboard replaces it", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const { createVaultFixture } = await import("../sdk/vault-fixture");
  const binding = await createVaultFixture();
  const actions = {
    error: null,
    requireBinding: vi.fn(),
    retry: vi.fn(),
    rebuild: vi.fn(),
    disconnect: vi.fn(),
  };
  vi.mocked(useVault).mockReturnValue({ ...actions, status: "missing-identity", binding: null });
  const view = render(
    <Providers localFaucet={LOCAL_FAUCET_DESCRIPTOR_FIXTURE}>
      <Home />
    </Providers>,
  );
  try {
    const homeTrigger = screen.getAllByRole("button", { name: "Vault identity: not set" })[1];
    if (!homeTrigger) throw new Error("Expected the home identity control");
    fireEvent.click(homeTrigger);
    fireEvent.change(screen.getByLabelText("Vault secret"), { target: { value: "03".repeat(32) } });
    fireEvent.click(screen.getByRole("button", { name: "Use vault secret" }));
    vi.mocked(useVault).mockReturnValue({ ...actions, status: "ready", binding });
    view.rerender(
      <Providers localFaucet={LOCAL_FAUCET_DESCRIPTOR_FIXTURE}>
        <Home />
      </Providers>,
    );
    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(screen.getByRole("banner")).getByRole("button", { name: "Vault identity: set" }),
      );
    });
    expect(screen.queryByRole("heading", { name: "To activate the dApp" })).toBeNull();
  } finally {
    view.unmount();
    binding.providers.privateStateProvider.dispose();
    await binding.providers.publicDataProvider.dispose();
    await binding.wallet.disconnect();
  }
});
