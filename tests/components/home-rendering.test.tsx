import { cleanup, render, screen } from "@testing-library/react";
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
    identitySecret: "",
    setIdentitySecret: vi.fn(),
    clearIdentity: vi.fn(),
    status: "ready",
    error: null,
    binding: null,
    requireBinding: vi.fn(),
    retry: vi.fn(),
    rebuild: vi.fn(),
    disconnect: vi.fn(),
  });
  vi.mocked(useMidnightConnection).mockReturnValue({
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
    <Providers>
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
    identitySecret: "",
    setIdentitySecret: vi.fn(),
    clearIdentity: vi.fn(),
    status: "ready",
    error: null,
    binding,
    requireBinding: vi.fn(),
    retry: vi.fn(),
    rebuild: vi.fn(),
    disconnect: vi.fn(),
  });
  vi.mocked(useMidnightConnection).mockReturnValue({
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
    },
  ]);
  try {
    const html = renderToStaticMarkup(
      <Providers>
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
