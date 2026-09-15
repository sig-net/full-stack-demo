import { parseRequestIdHex } from "@sig-net/midnight";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import * as tokens from "@/lib/constants/token-metadata";
import * as gasReserve from "@/lib/evm/gas-reserve";
import {
  flow,
  type FlowKind,
  type FlowState,
  type VaultExecutionResult,
} from "@/lib/midnight/flow";
import { midnightTxHistory } from "@/lib/midnight/tx-history";
import * as vault from "@/lib/midnight/vault";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";
import { RuntimeConfigProvider } from "@/providers/runtime-config-context";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations, VaultOperationsProvider } from "@/providers/vault-operations-context";

import {
  mockMatchingRuntimeServer,
  testRuntimeConfiguration,
} from "../config/runtime-server-fixture";
import { createVaultFixture } from "../sdk/vault-fixture";
import { useReadyMidnightFixture } from "./midnight-readiness-fixture";

const MIDNIGHT_CLAIM_HASH = "34".repeat(32);

vi.mock(import("@/providers/vault-context"), { spy: true });
vi.mock(import("@/providers/vault-balances-context"), { spy: true });
vi.mock(import("@/providers/midnight-readiness-context"), { spy: true });
vi.mock(import("@/lib/midnight/vault"), { spy: true });
vi.mock(import("@/lib/constants/token-metadata"), { spy: true });
vi.mock(import("@/lib/evm/gas-reserve"), { spy: true });
afterEach(() => {
  cleanup();
  flow.reset();
});

const scenarios: {
  kind: FlowKind;
  outcome: "completed" | "refunded" | "failed";
  recovery?: "owned" | "superseded";
  replacedAfterSubmission?: boolean;
  unmounted?: boolean;
}[] = [];
for (const kind of ["deposit", "withdraw", "swap", "supply", "redeem"] satisfies FlowKind[]) {
  scenarios.push({ kind, outcome: "completed" }, { kind, outcome: "failed" });
  if (kind !== "deposit") scenarios.push({ kind, outcome: "refunded" });
}
scenarios.push(
  { kind: "deposit", outcome: "completed", replacedAfterSubmission: true },
  { kind: "withdraw", outcome: "failed", unmounted: true },
  { kind: "deposit", outcome: "failed", recovery: "owned" },
  { kind: "deposit", outcome: "failed", recovery: "superseded" },
);
it.each(scenarios)(
  "shares the $kind lock and preserves the $outcome history terminal with recovery $recovery",
  async ({ kind, outcome, recovery, replacedAfterSubmission, unmounted }) => {
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
    vi.mocked(gasReserve.requireGasReserve).mockResolvedValue(undefined);
    mockMatchingRuntimeServer();
    const rebuilding = Promise.withResolvers<typeof binding>();
    const rebuildEntered = Promise.withResolvers<undefined>();
    const rebuild = vi.fn<ReturnType<typeof useVault>["rebuild"]>().mockImplementation(() => {
      rebuildEntered.resolve(undefined);
      return rebuilding.promise;
    });
    vi.mocked(useVault).mockReturnValue({
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
      checkedAt: null,
      error: null,
      refresh,
    });
    vi.mocked(useMidnightReadiness).mockImplementation(function useFixtureReadiness() {
      return useReadyMidnightFixture(binding.wallet);
    });
    const execution = Promise.withResolvers<undefined>();
    const recordId = parseRequestIdHex("01".repeat(32));
    const record = (
      onRecord: Parameters<typeof vault.runDeposit>[8],
    ): Promise<VaultExecutionResult> => {
      onRecord?.(recordId, `0x${"01".repeat(32)}`);
      return execution.promise.then(() => {
        return outcome === "refunded"
          ? { status: "refunded", midnightTxHash: MIDNIGHT_CLAIM_HASH }
          : { status: "settled", outputUnits: 12n, midnightTxHash: MIDNIGHT_CLAIM_HASH };
      });
    };
    const deposit = vi
      .mocked(vault.runDeposit)
      .mockImplementation(
        (
          _progress,
          _providers,
          _contract,
          _environment,
          _identity,
          _token,
          _amount,
          _log,
          onRecord,
        ) => record(onRecord),
      );
    const withdraw = vi
      .mocked(vault.runWithdraw)
      .mockImplementation(
        (
          _progress,
          _providers,
          _contract,
          _environment,
          _identity,
          _token,
          _amount,
          _receiver,
          _log,
          onRecord,
        ) => record(onRecord),
      );
    const swap = vi
      .mocked(vault.runSwap)
      .mockImplementation(
        (
          _progress,
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
          onRecord,
        ) => record(onRecord),
      );
    const supply = vi
      .mocked(vault.runSupply)
      .mockImplementation(
        async (
          _progress,
          _providers,
          _contract,
          _environment,
          _identity,
          _amount,
          _log,
          onRecord,
        ) => {
          return record(onRecord);
        },
      );
    const redeem = vi
      .mocked(vault.runRedeem)
      .mockImplementation(
        async (
          _progress,
          _providers,
          _contract,
          _environment,
          _identity,
          _amount,
          _log,
          onRecord,
        ) => {
          return record(onRecord);
        },
      );
    const executions = { deposit, withdraw, swap, supply, redeem };
    const execute = executions[kind];
    const history = vi.spyOn(midnightTxHistory, "add");
    const terminal = vi.spyOn(midnightTxHistory, "update");
    // A later operation claiming shared progress, which the abandoned one may never overwrite.
    const takeover = {};
    const snapshots = vi.fn<(state: FlowState) => void>();
    const unsubscribe = flow.subscribe(snapshots);
    const query = new QueryClient();
    const mounted = renderHook(() => [useVaultOperations(), useVaultOperations()] as const, {
      wrapper: ({ children }) => (
        <StrictMode>
          <QueryClientProvider client={query}>
            <RuntimeConfigProvider initialConfiguration={testRuntimeConfiguration()}>
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
      await expect(mounted.result.current[1].deposit(token.erc20Address, 1000000n)).rejects.toThrow(
        "progress",
      );
      expect(execute).not.toHaveBeenCalled();
      expect(mounted.result.current[0].currentDeposit).toEqual(
        kind === "deposit"
          ? { token: token.erc20Address, requestId: null, status: "pending" }
          : null,
      );
      await waitFor(() => {
        expect(execute).toHaveBeenCalledTimes(1);
      });
      expect(mounted.result.current[0].busy).toBe(true);
      expect(mounted.result.current[0].currentDeposit).toEqual(
        kind === "deposit"
          ? { token: token.erc20Address, requestId: recordId, status: "pending" }
          : null,
      );
      await expect(mounted.result.current[1].deposit(token.erc20Address, 1000000n)).rejects.toThrow(
        "progress",
      );
      if (!first) throw new Error("Expected synchronously captured operation promise");
      const settled = Promise.allSettled([first]);
      if (unmounted) mounted.unmount();
      if (replacedAfterSubmission) {
        vi.spyOn(binding, "assertActive").mockImplementation(() => {
          throw new Error("Vault session superseded.");
        });
        flow.start("swap", takeover);
        const progress = deposit.mock.calls[0]?.[0];
        const log = deposit.mock.calls[0]?.[7];
        progress?.set("refunding");
        log?.("Obsolete operation log");
      }
      expect(flow.phase).toBe("preparing");
      expect(mounted.result.current[0].log.join(" ")).not.toContain("Obsolete operation log");
      const failure = recovery ? "Rebuild failed" : "Fixture proof rejected";
      await act(async () => {
        if (recovery) {
          execution.reject(new Error("Custom error: 196"));
          await rebuildEntered.promise;
          if (recovery === "superseded") {
            vi.spyOn(binding, "assertActive").mockImplementation(() => {
              throw new Error("Vault session superseded.");
            });
            flow.start("swap", takeover);
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
      const terminals = snapshots.mock.calls
        .map(([state]) => state)
        .filter((state) => state.phase === "done");
      expect(terminals).toHaveLength(outcome === "failed" || replacedAfterSubmission ? 0 : 1);
      expect(terminals.every((state) => state.refunded === (outcome === "refunded"))).toBe(true);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalledTimes(outcome === "failed" ? 0 : 1);
      expect(history).toHaveBeenCalledTimes(1);
      expect(terminal).toHaveBeenCalledWith(
        recordId,
        expect.objectContaining({ status: recovery === "superseded" ? "interrupted" : outcome }),
      );
      expect(rebuild).toHaveBeenCalledTimes(recovery ? 1 : 0);
      expect(flow.error).toBe(
        outcome === "failed" && recovery !== "superseded" && !unmounted ? failure : null,
      );
      expect(flow.kind).toBe(recovery === "superseded" || replacedAfterSubmission ? "swap" : kind);
      expect(terminal).toHaveBeenCalledWith(
        recordId,
        expect.objectContaining(
          outcome === "failed"
            ? {
                status: recovery === "superseded" ? "interrupted" : "failed",
                failureReason: recovery === "superseded" ? "Vault session superseded." : failure,
              }
            : { status: outcome },
        ),
      );
      expect(terminal).toHaveBeenCalledWith(
        recordId,
        expect.objectContaining(
          outcome === "failed"
            ? { status: recovery === "superseded" ? "interrupted" : "failed" }
            : { midnightTxHash: MIDNIGHT_CLAIM_HASH },
        ),
      );
      expect(history.mock.calls[0]?.[0].evmTxHash).toBe(`0x${"01".repeat(32)}`);
      expect(mounted.result.current[0].busy).toBe(unmounted === true);
      {
        expect(mounted.result.current[0].currentDeposit).toEqual(
          kind !== "deposit" || replacedAfterSubmission || recovery === "superseded"
            ? null
            : { token: token.erc20Address, requestId: recordId, status: outcome },
        );
        act(() => {
          deposit.mock.calls[0]?.[8]?.(parseRequestIdHex("02".repeat(32)));
        });
        expect(mounted.result.current[0].currentDeposit?.requestId).not.toBe("02".repeat(32));
      }
    } finally {
      unsubscribe();
      mounted.unmount();
      query.clear();
      binding.providers.privateStateProvider.dispose();
      await binding.providers.publicDataProvider.dispose();
    }
  },
);

it("retains the confirmed deposit when manual recovery fails validation", async () => {
  const binding = await createVaultFixture();
  const token = tokens.MIDNIGHT_TOKENS[0];
  if (!token) throw new Error("Expected supported token");
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS", binding.environment.contractAddress);
  vi.stubEnv(
    "NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS",
    binding.environment.signetContractAddress,
  );
  vi.stubEnv("NEXT_PUBLIC_MPC_SECP256K1_PUBKEY", binding.environment.mpcSecpPub);
  mockMatchingRuntimeServer();
  vi.mocked(tokens.fetchErc20Decimals).mockResolvedValue(6);
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
    refresh: vi.fn().mockResolvedValue(undefined),
  });
  vi.mocked(useMidnightReadiness).mockImplementation(() => useReadyMidnightFixture(binding.wallet));
  const id = parseRequestIdHex("ab".repeat(32));
  vi.mocked(vault.runDeposit).mockImplementation(
    (
      _progress,
      _providers,
      _contract,
      _environment,
      _identity,
      _token,
      _amount,
      _log,
      onRecord,
    ) => {
      onRecord?.(id);
      return Promise.resolve({
        status: "settled",
        outputUnits: null,
        midnightTxHash: MIDNIGHT_CLAIM_HASH,
      });
    },
  );
  vi.mocked(vault.lookupDepositRequest).mockResolvedValue({
    kind: "mismatched",
    requestId: parseRequestIdHex("cd".repeat(32)),
    mismatch: "token",
  });
  const query = new QueryClient();
  const view = renderHook(() => useVaultOperations(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={query}>
        <RuntimeConfigProvider initialConfiguration={testRuntimeConfiguration()}>
          <VaultOperationsProvider>{children}</VaultOperationsProvider>
        </RuntimeConfigProvider>
      </QueryClientProvider>
    ),
  });
  try {
    await waitFor(() => {
      expect(view.result.current.ready).toBe(true);
    });
    await act(async () => {
      await view.result.current.deposit(token.erc20Address, 100000n);
    });
    expect(view.result.current.currentDeposit).toEqual({
      token: token.erc20Address,
      requestId: id,
      status: "completed",
    });
    await act(async () => {
      await expect(
        view.result.current.recoverDeposit(token.erc20Address, "cd".repeat(32)),
      ).rejects.toThrow("different token");
    });
    expect(view.result.current.currentDeposit).toEqual({
      token: token.erc20Address,
      requestId: id,
      status: "completed",
    });
  } finally {
    view.unmount();
    query.clear();
    binding.providers.privateStateProvider.dispose();
    await binding.providers.publicDataProvider.dispose();
  }
});

it.each(["failed", "completed"] as const)(
  "settles shared progress when the captured session is replaced during a %s operation",
  async (outcome) => {
    const binding = await createVaultFixture();
    const token = tokens.MIDNIGHT_TOKENS[0];
    if (!token) throw new Error("Expected supported token");
    vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS", binding.environment.contractAddress);
    vi.stubEnv(
      "NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS",
      binding.environment.signetContractAddress,
    );
    vi.stubEnv("NEXT_PUBLIC_MPC_SECP256K1_PUBKEY", binding.environment.mpcSecpPub);
    mockMatchingRuntimeServer();
    vi.mocked(tokens.fetchErc20Decimals).mockResolvedValue(6);
    vi.mocked(gasReserve.requireGasReserve).mockResolvedValue(undefined);
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
      refresh: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(useMidnightReadiness).mockImplementation(function useFixtureReadiness() {
      return useReadyMidnightFixture(binding.wallet);
    });
    const execution = Promise.withResolvers<VaultExecutionResult>();
    vi.mocked(vault.runDeposit).mockImplementation(() => execution.promise);
    const query = new QueryClient();
    const mounted = renderHook(
      () => ({ operations: useVaultOperations(), progress: useMidnightProgress() }),
      {
        wrapper: ({ children }) => (
          <StrictMode>
            <QueryClientProvider client={query}>
              <RuntimeConfigProvider initialConfiguration={testRuntimeConfiguration()}>
                <VaultOperationsProvider>{children}</VaultOperationsProvider>
              </RuntimeConfigProvider>
            </QueryClientProvider>
          </StrictMode>
        ),
      },
    );
    try {
      await waitFor(() => {
        expect(mounted.result.current.operations.ready).toBe(true);
      });
      let sweep: Promise<{ refunded: boolean }> | undefined;
      act(() => {
        sweep = mounted.result.current.operations.deposit(token.erc20Address, 1000000n);
      });
      await waitFor(() => {
        expect(vi.mocked(vault.runDeposit)).toHaveBeenCalledTimes(1);
      });
      expect(mounted.result.current.progress.active).toBe(true);
      vi.spyOn(binding, "assertActive").mockImplementation(() => {
        throw new Error("Vault session superseded.");
      });
      await act(async () => {
        if (outcome === "failed") execution.reject(new Error("Fixture proof rejected"));
        else
          execution.resolve({
            status: "settled",
            outputUnits: null,
            midnightTxHash: MIDNIGHT_CLAIM_HASH,
          });
        await Promise.allSettled([sweep]);
      });
      expect(mounted.result.current.progress.active).toBe(false);
      expect(mounted.result.current.operations.busy).toBe(false);
      expect(flow.phase).toBe(outcome === "failed" ? "preparing" : "done");
      // The replacement and the failure it interrupted are both named, so a node rejection
      // observed by the replaced session stays readable in the terminal state.
      expect(flow.error).toBe(
        outcome === "failed"
          ? "Vault session superseded. The failure it interrupted: Fixture proof rejected"
          : null,
      );
    } finally {
      mounted.unmount();
      query.clear();
      binding.providers.privateStateProvider.dispose();
      await binding.providers.publicDataProvider.dispose();
      await binding.wallet.disconnect();
    }
  },
);
