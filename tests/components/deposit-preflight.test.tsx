import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { MIDNIGHT_TOKENS } from "@/lib/constants/token-metadata";
import { EvmBalancesProvider } from "@/providers/evm-balances-context";
import { EvmDepositProvider, useEvmDeposit } from "@/providers/evm-deposit-context";
import { EvmWalletProvider, useEvmWallet } from "@/providers/evm-wallet-context";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";
import { RuntimeConfigProvider } from "@/providers/runtime-config-context";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

import { mockMatchingRuntimeServer } from "../config/runtime-server-fixture";
import { browserWalletFixture, hash } from "../evm/browser-wallet-fixture";
import { createVaultFixture } from "../sdk/vault-fixture";
import { useReadyMidnightFixture } from "./midnight-readiness-fixture";

vi.mock(import("@/providers/vault-context"), { spy: true });
vi.mock(import("@/providers/vault-balances-context"), { spy: true });
vi.mock(import("@/providers/vault-operations-context"), { spy: true });
vi.mock(import("@/providers/midnight-readiness-context"), { spy: true });

afterEach(cleanup);

it("serialises EVM deposit preflight and preserves confirmed transfer state", async () => {
  const binding = await createVaultFixture();
  const walletFixture = browserWalletFixture();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const token = MIDNIGHT_TOKENS[0];
  if (!token) throw new Error("Expected a supported deposit token");
  const readinessGate = Promise.withResolvers<undefined>();
  const readiness = vi.fn<() => Promise<undefined>>(() => readinessGate.promise);
  let decimals = 8;
  const refresh = vi
    .fn<ReturnType<typeof useVaultBalances>["refresh"]>()
    .mockRejectedValue(new Error("refresh failed"));
  const transfer = vi.spyOn(walletFixture.wallet, "transferErc20").mockImplementation((input) => {
    input.beforeSubmit?.();
    input.submitted(hash);
    return Promise.resolve({ hash, units: input.units });
  });

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
    error: null,
    refresh,
  });
  vi.mocked(useVaultOperations).mockReturnValue({
    log: [],
    busy: false,
    ready: true,
    unavailable: null,
    deposit: vi.fn(),
    recoverDeposit: vi.fn(),
    withdraw: vi.fn(),
    swap: vi.fn(),
    supply: vi.fn(),
    redeem: vi.fn(),
  });
  vi.mocked(useMidnightReadiness).mockImplementation(() => ({
    ...useReadyMidnightFixture(binding.wallet),
    requireReady: readiness,
  }));
  mockMatchingRuntimeServer();
  vi.spyOn(walletFixture.publicClient, "getBalance").mockResolvedValue(1_000_000_000_000_000_000n);
  vi.spyOn(walletFixture.publicClient, "readContract").mockImplementation(({ functionName }) =>
    Promise.resolve(functionName === "decimals" ? decimals : 50n),
  );

  const { result, unmount } = renderHook(
    () => ({ deposit: useEvmDeposit(), wallet: useEvmWallet() }),
    {
      wrapper: ({ children }) => (
        <StrictMode>
          <QueryClientProvider client={queryClient}>
            <RuntimeConfigProvider>
              <EvmWalletProvider>
                <EvmBalancesProvider tokens={[token.erc20Address]}>
                  <EvmDepositProvider>{children}</EvmDepositProvider>
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
      await result.current.wallet.connect({
        key: walletFixture.provider,
        create: () => walletFixture.wallet,
      });
    });
    await waitFor(() => {
      expect(result.current.wallet.wallet).toBe(walletFixture.wallet);
    });

    let first: Promise<void> | undefined;
    act(() => {
      first = result.current.deposit.sendDeposit(binding, token.erc20Address, "0.00000007");
      void result.current.deposit.sendDeposit(binding, token.erc20Address, "0.00000007");
    });
    await waitFor(() => {
      expect(readiness).toHaveBeenCalledTimes(1);
    });
    expect(transfer).not.toHaveBeenCalled();

    await act(async () => {
      readinessGate.resolve(undefined);
      await first;
    });
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(transfer.mock.calls[0]?.[0].units).toBe(7n);
    expect(transfer.mock.calls[0]?.[0].token).toBe(token.erc20Address);
    expect(result.current.deposit.transfer).toMatchObject({
      amount: "0.00000007",
      chainId: walletFixture.wallet.chain.id,
      hash,
      status: "confirmed",
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.deposit.sendDeposit(binding, token.erc20Address, "0.000000001");
    });
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(result.current.deposit.transfer?.status).toBe("error");

    decimals = Number.NaN;
    await act(async () => {
      await result.current.deposit.sendDeposit(binding, token.erc20Address, "0.1");
    });
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(result.current.deposit.transfer?.error).toContain("decimals are unavailable");
  } finally {
    unmount();
    queryClient.clear();
    walletFixture.wallet.disconnect();
    binding.providers.privateStateProvider.dispose();
    await binding.providers.publicDataProvider.dispose();
    await binding.wallet.disconnect();
  }
});
