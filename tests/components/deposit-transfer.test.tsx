import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { EvmDepositTransfer } from "@/components/deposit-dialog/evm-deposit-transfer";
import { useServerRuntimeCompatibility } from "@/hooks/use-server-runtime-compatibility";
import { MIDNIGHT_TOKENS } from "@/lib/constants/token-metadata";
import type { VaultBinding } from "@/lib/midnight/vault-session";
import { EvmBalancesProvider, useEvmBalances } from "@/providers/evm-balances-context";
import { EvmDepositProvider, useEvmDeposit } from "@/providers/evm-deposit-context";
import { EvmWalletProvider, useEvmWallet } from "@/providers/evm-wallet-context";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";
import { RuntimeConfigProvider } from "@/providers/runtime-config-context";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

import {
  mockMatchingRuntimeServer,
  testRuntimeConfiguration,
} from "../config/runtime-server-fixture";
import { browserWalletFixture, hash } from "../evm/browser-wallet-fixture";
import { createVaultFixture } from "../sdk/vault-fixture";
import { useReadyMidnightFixture } from "./midnight-readiness-fixture";

vi.mock(import("@/providers/vault-context"), { spy: true });
vi.mock(import("@/providers/vault-balances-context"), { spy: true });
vi.mock(import("@/providers/vault-operations-context"), { spy: true });
vi.mock(import("@/providers/midnight-readiness-context"), { spy: true });
vi.mock(import("@/components/evm-wallet-button"), () => ({
  EvmWalletButton: () => <button type="button">Fixture wallet</button>,
}));
afterEach(cleanup);

it.each([false, true])("retains transfer ownership with supersession=%s", async (superseded) => {
  vi.stubEnv(
    "NEXT_PUBLIC_SEPOLIA_RPC_URL",
    superseded ? "https://rpc.example.invalid" : "http://127.0.0.1:8545",
  );
  const binding = await createVaultFixture();
  const f = browserWalletFixture();
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const token = MIDNIGHT_TOKENS[0];
  if (!token) throw new Error("Expected a supported deposit token");
  let active: VaultBinding = binding;
  vi.mocked(binding.assertActive).mockImplementation(() => {
    if (active !== binding) throw new Error("Vault session changed");
  });
  vi.mocked(useVault).mockImplementation(() => ({
    status: "ready",
    error: null,
    binding: active,
    requireBinding: () => active,
    retry: vi.fn(),
    rebuild: vi.fn<ReturnType<typeof useVault>["rebuild"]>(),
    disconnect: vi.fn(),
  }));
  const refresh = vi
    .fn<ReturnType<typeof useVaultBalances>["refresh"]>()
    .mockResolvedValue(undefined);
  vi.mocked(useVaultBalances).mockReturnValue({
    balances: null,
    loading: false,
    error: null,
    refresh,
  });
  let sweepGate = Promise.withResolvers<{ refunded: boolean }>();
  const deposit = vi.fn<ReturnType<typeof useVaultOperations>["deposit"]>(() => sweepGate.promise);
  vi.mocked(useVaultOperations).mockReturnValue({
    currentDeposit: null,
    log: [],
    busy: false,
    ready: true,
    unavailable: null,
    deposit,
    recoverDeposit: vi.fn(),
    withdraw: vi.fn(),
    swap: vi.fn(),
    supply: vi.fn(),
    redeem: vi.fn(),
  });
  vi.mocked(useMidnightReadiness).mockImplementation(function useFixtureReadiness() {
    return useReadyMidnightFixture(binding.wallet);
  });
  mockMatchingRuntimeServer();
  vi.spyOn(f.publicClient, "getBalance").mockResolvedValue(1000000000000000000n);
  vi.spyOn(f.publicClient, "readContract").mockImplementation(({ functionName }) =>
    Promise.resolve(functionName === "decimals" ? 6 : 2000000n),
  );
  const sendGate = Promise.withResolvers<undefined>();
  const send = vi.spyOn(f.wallet, "transferErc20").mockImplementation(async (input) => {
    input.beforeSubmit?.();
    input.submitted(hash);
    await sendGate.promise;
    return { hash, units: input.units };
  });
  const { result, unmount } = renderHook(
    () => ({
      connection: useEvmWallet(),
      balances: useEvmBalances(),
      runtime: useServerRuntimeCompatibility(),
      deposit: useEvmDeposit(),
    }),
    {
      wrapper: ({ children }) => (
        <StrictMode>
          <QueryClientProvider client={query}>
            <RuntimeConfigProvider initialConfiguration={testRuntimeConfiguration()}>
              <EvmWalletProvider>
                <EvmBalancesProvider tokens={[token.erc20Address]}>
                  <EvmDepositProvider>
                    {children}
                    <EvmDepositTransfer token={token} />
                  </EvmDepositProvider>
                </EvmBalancesProvider>
              </EvmWalletProvider>
            </RuntimeConfigProvider>
          </QueryClientProvider>
        </StrictMode>
      ),
    },
  );
  try {
    await act(async () => {
      await result.current.connection.connect({ key: f.provider, create: () => f.wallet });
    });
    await waitFor(() => {
      expect(result.current.balances.isSuccess).toBe(true);
      expect(result.current.runtime.serverUnavailable).toBeNull();
    });
    let transfer: Promise<void> | undefined;
    act(() => {
      transfer = result.current.deposit.sendDeposit(binding, token.erc20Address, "1");
    });
    await waitFor(() => {
      expect(send).toHaveBeenCalledTimes(1);
    });
    if (superseded) {
      active = { ...binding, sessionId: "replacement" };
      act(() => {
        result.current.connection.disconnect();
      });
    }
    await act(async () => {
      sendGate.resolve(undefined);
      await transfer;
    });
    expect(result.current.deposit.transfer?.hash).toBe(hash);
    expect(result.current.deposit.transfer?.destination).toBe(binding.depositAddress);
    expect(result.current.deposit.transfer?.status).toBe("confirmed");
    expect(refresh).toHaveBeenCalledTimes(superseded ? 0 : 1);
    expect(screen.getByRole("button", { name: "Copy Transaction hash" })).toHaveProperty(
      "disabled",
      false,
    );
    const explorerLink = screen.queryByRole("link", { name: "View transaction in explorer" });
    expect(explorerLink?.getAttribute("href") ?? null).toBe(
      superseded ? `https://sepolia.etherscan.io/tx/${hash}` : null,
    );
    let failedSweep: string | undefined = "ready";
    let firstSweepCount = 0;
    if (superseded) {
      await act(async () => {
        await result.current.deposit.continueDeposit();
      });
    } else {
      let first: Promise<void> | undefined;
      act(() => {
        first = result.current.deposit.continueDeposit();
      });
      await act(async () => {
        await result.current.deposit.continueDeposit();
      });
      firstSweepCount = deposit.mock.calls.length;
      const transferButton = screen.getByRole("button", {
        name: "Transfer confirmed",
      });
      if (!transferButton.hasAttribute("disabled"))
        throw new Error("Pending continuation must block another transfer");
      sweepGate.reject(new Error("Midnight failed"));
      await act(async () => {
        await first;
      });
      failedSweep = result.current.deposit.transfer?.sweep;
      sweepGate = Promise.withResolvers<{ refunded: boolean }>();
      let retry: Promise<void> | undefined;
      act(() => {
        retry = result.current.deposit.continueDeposit();
      });
      await act(async () => {
        sweepGate.resolve({ refunded: false });
        await retry;
      });
      await act(async () => {
        await result.current.deposit.continueDeposit();
      });
    }
    expect(firstSweepCount).toBe(superseded ? 0 : 1);
    expect(failedSweep).toBe("ready");
    expect(result.current.deposit.transfer?.sweep).toBe(superseded ? "ready" : "complete");
    expect(result.current.deposit.transfer?.error).toBe(
      superseded ? "Vault session changed" : undefined,
    );
    expect(deposit).toHaveBeenCalledTimes(superseded ? 0 : 2);
  } finally {
    unmount();
    query.clear();
    f.wallet.disconnect();
    binding.providers.privateStateProvider.dispose();
    await binding.providers.publicDataProvider.dispose();
    await binding.wallet.disconnect();
  }
});
