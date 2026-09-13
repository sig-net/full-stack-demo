import { parseRequestIdHex } from "@sig-net/midnight";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import * as tokens from "@/lib/constants/token-metadata";
import { flow, type FlowKind } from "@/lib/midnight/flow";
import { midnightTxHistory } from "@/lib/midnight/tx-history";
import * as vault from "@/lib/midnight/vault";
import { RuntimeConfigProvider } from "@/providers/runtime-config-context";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations, VaultOperationsProvider } from "@/providers/vault-operations-context";
import { useWalletReadiness } from "@/providers/wallet-readiness-context";

import { mockMatchingRuntimeServer } from "../config/runtime-server-fixture";
import { createVaultFixture } from "../sdk/vault-fixture";
import { useReadyWalletFixture } from "./wallet-readiness-fixture";

vi.mock(import("@/providers/vault-context"), { spy: true });
vi.mock(import("@/providers/vault-balances-context"), { spy: true });
vi.mock(import("@/providers/wallet-readiness-context"), { spy: true });
vi.mock(import("@/lib/midnight/vault"), { spy: true });
vi.mock(import("@/lib/constants/token-metadata"), { spy: true });
afterEach(() => {
  cleanup();
  flow.reset();
});

const scenarios: {
  kind: FlowKind;
  outcome: "completed" | "refunded" | "failed";
  recovery?: "owned" | "superseded";
}[] = [];
for (const kind of ["deposit", "withdraw", "swap", "supply", "redeem"] satisfies FlowKind[]) {
  scenarios.push({ kind, outcome: "completed" }, { kind, outcome: "failed" });
  if (kind !== "deposit") scenarios.push({ kind, outcome: "refunded" });
}
scenarios.push(
  { kind: "deposit", outcome: "failed", recovery: "owned" },
  { kind: "deposit", outcome: "failed", recovery: "superseded" },
);
it.each(scenarios)(
  "shares the $kind lock and preserves the $outcome history terminal with recovery $recovery",
  async ({ kind, outcome, recovery }) => {
    const binding = await createVaultFixture();
    vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS", binding.environment.contractAddress);
    vi.stubEnv(
      "NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS",
      binding.environment.signetContractAddress,
    );
    vi.stubEnv("NEXT_PUBLIC_MPC_SECP256K1_PUBKEY", binding.environment.mpcSecpPub);
    const token = tokens.MIDNIGHT_TOKENS[0];
    if (!token) throw new Error("Expected supported token");
    vi.mocked(tokens.fetchErc20Decimals).mockResolvedValue(6);
    mockMatchingRuntimeServer();
    const serverFetch = globalThis.fetch;
    const funding = Promise.withResolvers<Response>();
    const funded = vi.fn(() => funding.promise);
    vi.stubGlobal(
      "fetch",
      (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
        input === "/api/midnight/gas-topup" ? funded() : serverFetch(input, init),
    );
    const rebuilding = Promise.withResolvers<typeof binding>();
    const rebuildEntered = Promise.withResolvers<undefined>();
    const rebuild = vi.fn<ReturnType<typeof useVault>["rebuild"]>().mockImplementation(() => {
      rebuildEntered.resolve(undefined);
      return rebuilding.promise;
    });
    vi.mocked(useVault).mockReturnValue({
      identitySecret: "",
      setIdentitySecret: vi.fn(),
      clearIdentity: vi.fn(),
      status: "ready",
      error: null,
      binding,
      requireBinding: () => binding,
      retry: vi.fn(),
      rebuild,
      disconnect: vi.fn(),
    });
    const refresh = vi
      .fn<ReturnType<typeof useVaultBalances>["refresh"]>()
      .mockRejectedValue(new Error("Refresh failed"));
    vi.mocked(useVaultBalances).mockReturnValue({
      balances: null,
      loading: false,
      error: null,
      refresh,
    });
    vi.mocked(useWalletReadiness).mockImplementation(function useFixtureReadiness() {
      return useReadyWalletFixture(binding.wallet);
    });
    const execution = Promise.withResolvers<undefined>();
    const recordId = parseRequestIdHex("01".repeat(32));
    const record = (onRecord: Parameters<typeof vault.runDeposit>[7]): Promise<void> => {
      onRecord?.(recordId, `0x${"01".repeat(32)}`);
      return execution.promise.then(() => {
        if (outcome === "refunded") flow.finishRefunded();
        else flow.set("done");
      });
    };
    const deposit = vi
      .mocked(vault.runDeposit)
      .mockImplementation(
        (_providers, _contract, _environment, _identity, _token, _amount, _log, onRecord) =>
          record(onRecord),
      );
    const withdraw = vi
      .mocked(vault.runWithdraw)
      .mockImplementation(
        (
          _providers,
          _contract,
          _environment,
          _identity,
          _token,
          _amount,
          _receiver,
          _log,
          _fund,
          onRecord,
        ) => record(onRecord),
      );
    const swap = vi
      .mocked(vault.runSwap)
      .mockImplementation(
        (
          _providers,
          _contract,
          _environment,
          _identity,
          _tokenIn,
          _tokenOut,
          _amount,
          _log,
          _fee,
          _slippage,
          _fund,
          onRecord,
        ) => record(onRecord),
      );
    const supply = vi
      .mocked(vault.runSupply)
      .mockImplementation(
        async (_providers, _contract, _environment, _identity, _amount, _log, _fund, onRecord) => {
          await record(onRecord);
          return 12n;
        },
      );
    const redeem = vi
      .mocked(vault.runRedeem)
      .mockImplementation(
        async (_providers, _contract, _environment, _identity, _amount, _log, _fund, onRecord) => {
          await record(onRecord);
          return 12n;
        },
      );
    const executions = { deposit, withdraw, swap, supply, redeem };
    const execute = executions[kind];
    const history = vi.spyOn(midnightTxHistory, "add");
    const terminal = vi.spyOn(midnightTxHistory, "update");
    const query = new QueryClient();
    const mounted = renderHook(() => [useVaultOperations(), useVaultOperations()] as const, {
      wrapper: ({ children }) => (
        <StrictMode>
          <QueryClientProvider client={query}>
            <RuntimeConfigProvider>
              <VaultOperationsProvider>{children}</VaultOperationsProvider>
            </RuntimeConfigProvider>
          </QueryClientProvider>
        </StrictMode>
      ),
    });
    try {
      await waitFor(() => {
        expect(mounted.result.current[0].ready).toBe(true);
      });
      let first: Promise<{ refunded: boolean }> | undefined;
      act(() => {
        const owner = mounted.result.current[0];
        switch (kind) {
          case "deposit":
            first = owner.deposit(token.erc20Address, 1000000n);
            break;
          case "withdraw":
            first = owner.withdraw(token.erc20Address, 1000000n);
            break;
          case "swap":
            first = owner.swap(token.erc20Address, token.erc20Address, 1000000n);
            break;
          case "supply":
            first = owner.supply(1000000n);
            break;
          case "redeem":
            first = owner.redeem(1000000n);
            break;
        }
      });
      await waitFor(() => {
        expect(funded).toHaveBeenCalledTimes(1);
      });
      await expect(mounted.result.current[1].deposit(token.erc20Address, 1000000n)).rejects.toThrow(
        "progress",
      );
      expect(execute).not.toHaveBeenCalled();
      act(() => {
        funding.resolve(Response.json({ ok: true }));
      });
      await waitFor(() => {
        expect(execute).toHaveBeenCalledTimes(1);
      });
      expect(mounted.result.current[0].busy).toBe(true);
      await expect(mounted.result.current[1].deposit(token.erc20Address, 1000000n)).rejects.toThrow(
        "progress",
      );
      if (!first) throw new Error("Expected synchronously captured operation promise");
      const settled = Promise.allSettled([first]);
      const failure = recovery ? "Rebuild failed" : "Fixture proof rejected";
      await act(async () => {
        if (recovery) {
          execution.reject(new Error("Custom error: 196"));
          await rebuildEntered.promise;
          if (recovery === "superseded") {
            vi.spyOn(binding, "assertActive").mockImplementation(() => {
              throw new Error("Vault session superseded.");
            });
            flow.start("swap");
          } else {
            rebuild.mock.lastCall?.[1]?.(new Error(failure));
          }
          rebuilding.reject(new Error(failure));
        } else if (outcome === "failed") execution.reject(new Error(failure));
        else execution.resolve(undefined);
        await expect(settled).resolves.toEqual([
          outcome === "failed"
            ? { status: "rejected", reason: new Error(failure) }
            : { status: "fulfilled", value: { refunded: outcome === "refunded" } },
        ]);
      });
      expect(execute).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalledTimes(outcome === "failed" ? 0 : 1);
      expect(history).toHaveBeenCalledTimes(1);
      expect(terminal).toHaveBeenCalledWith(recordId, expect.objectContaining({ status: outcome }));
      expect(rebuild).toHaveBeenCalledTimes(recovery ? 1 : 0);
      expect(flow.error).toBe(outcome === "failed" && recovery !== "superseded" ? failure : null);
      expect(flow.kind).toBe(recovery === "superseded" ? "swap" : kind);
      expect(terminal).toHaveBeenCalledWith(
        recordId,
        expect.objectContaining(
          outcome === "failed"
            ? {
                status: "failed",
                failureReason: recovery === "superseded" ? "Vault session superseded." : failure,
              }
            : { status: outcome },
        ),
      );
      expect(mounted.result.current[0].busy).toBe(false);
    } finally {
      mounted.unmount();
      query.clear();
      binding.providers.privateStateProvider.dispose();
      await binding.providers.publicDataProvider.dispose();
    }
  },
);
