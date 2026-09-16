import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { type Hash, ProviderRpcError, WaitForTransactionReceiptTimeoutError } from "viem";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { EvmDepositTransfer } from "@/components/deposit-dialog/evm-deposit-transfer";
import { useVaultGasReserves } from "@/hooks/use-vault-gas-reserves";
import { MIDNIGHT_TOKENS, type TokenConfig } from "@/lib/constants/token-metadata";
import {
  Erc20TransferError,
  type TransferFailureKind,
  type TransferRecovery,
} from "@/lib/evm/transfer-failure";
import type { Erc20Transfer } from "@/lib/evm/wallet/Wallet";
import { flow } from "@/lib/midnight/flow";
import { ConfigurationProvider } from "@/providers/configuration-context";
import { EvmBalancesProvider, useEvmBalances } from "@/providers/evm-balances-context";
import { EvmDepositProvider, useEvmDeposit } from "@/providers/evm-deposit-context";
import { EvmLocalFundingProvider } from "@/providers/evm-local-funding-context";
import { EvmWalletProvider, useEvmWallet } from "@/providers/evm-wallet-context";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

import { LOCAL_FAUCET_DESCRIPTOR_FIXTURE } from "../config/local-faucet-fixture";
import {
  mockMatchingRuntimeServer,
  testRuntimeConfiguration,
} from "../config/runtime-server-fixture";
import { browserWalletFixture, hash } from "../evm/browser-wallet-fixture";
import { createVaultFixture } from "../sdk/vault-fixture";
import { useReadyMidnightFixture } from "./midnight-readiness-fixture";
import { vaultGasReservesFixture } from "./vault-gas-fixture";

vi.mock(import("@/providers/vault-context"), { spy: true });
vi.mock(import("@/providers/vault-balances-context"), { spy: true });
vi.mock(import("@/providers/vault-operations-context"), { spy: true });
vi.mock(import("@/hooks/use-vault-gas-reserves"), { spy: true });
vi.mock(import("@/providers/midnight-readiness-context"), { spy: true });
vi.mock(import("@/components/evm-wallet-button"), () => ({
  EvmWalletButton: () => <button type="button">Fixture wallet</button>,
}));
beforeEach(() => {
  vi.mocked(useVaultGasReserves).mockReturnValue(vaultGasReservesFixture());
});
afterEach(() => {
  cleanup();
  flow.reset();
});

interface Exposed {
  connection: ReturnType<typeof useEvmWallet>;
  balances: ReturnType<typeof useEvmBalances>;
  deposit: ReturnType<typeof useEvmDeposit>;
}

function Bridge({ expose }: { expose: (value: Exposed) => void }): null {
  expose({
    connection: useEvmWallet(),
    balances: useEvmBalances(),
    deposit: useEvmDeposit(),
  });
  return null;
}

function Harness(properties: {
  token: TokenConfig;
  client: QueryClient;
  showSurface: boolean;
  expose: (value: Exposed) => void;
}): React.JSX.Element {
  const { token, client, showSurface, expose } = properties;
  return (
    <StrictMode>
      <QueryClientProvider client={client}>
        <ConfigurationProvider
          localFaucet={LOCAL_FAUCET_DESCRIPTOR_FIXTURE}
          initialConfiguration={testRuntimeConfiguration()}
        >
          <EvmWalletProvider>
            <EvmBalancesProvider tokens={[token.erc20Address]}>
              <EvmLocalFundingProvider>
                <EvmDepositProvider>
                  <Bridge expose={expose} />
                  {showSurface && (
                    <EvmDepositTransfer token={token} sweepReserveExplained={false} />
                  )}
                </EvmDepositProvider>
              </EvmLocalFundingProvider>
            </EvmBalancesProvider>
          </EvmWalletProvider>
        </ConfigurationProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}

interface Surface {
  token: TokenConfig;
  binding: Awaited<ReturnType<typeof createVaultFixture>>;
  transfer: ReturnType<
    typeof vi.fn<(input: Erc20Transfer) => Promise<{ hash: Hash; units: bigint }>>
  >;
  recheck: ReturnType<
    typeof vi.fn<(input: { hash: Hash }) => Promise<{ hash: Hash; units: bigint }>>
  >;
  sweep: ReturnType<typeof vi.fn<ReturnType<typeof useVaultOperations>["deposit"]>>;
  current: () => Exposed;
  showSurface: (visible: boolean) => void;
  /** Disconnects the captured signing session so its own assertion starts rejecting. */
  endSession: () => void;
  release: () => Promise<void>;
}

/**
 * Mounts the real transfer surface over the real deposit owner and a controlled signing session.
 *
 * @returns Handles for the mounted owner, its controlled transfer calls and teardown.
 */
async function mountTransferSurface(): Promise<Surface> {
  vi.stubEnv("NEXT_PUBLIC_SEPOLIA_RPC_URL", "http://127.0.0.1:8545");
  const binding = await createVaultFixture();
  const f = browserWalletFixture();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const token = MIDNIGHT_TOKENS[0];
  if (!token) throw new Error("Expected a supported deposit token");
  vi.mocked(useVault).mockImplementation(() => ({
    status: "ready",
    error: null,
    binding,
    requireBinding: () => binding,
    retry: vi.fn(),
    rebuild: vi.fn<ReturnType<typeof useVault>["rebuild"]>(),
    disconnect: vi.fn(),
  }));
  vi.mocked(useVaultBalances).mockReturnValue({
    balances: null,
    loading: false,
    checkedAt: null,
    error: null,
    refresh: vi.fn<ReturnType<typeof useVaultBalances>["refresh"]>().mockResolvedValue(undefined),
  });
  const sweep = vi
    .fn<ReturnType<typeof useVaultOperations>["deposit"]>()
    .mockResolvedValue({ refunded: false });
  vi.mocked(useVaultOperations).mockReturnValue({
    currentDeposit: null,
    log: [],
    busy: false,
    ready: true,
    unavailable: null,
    deposit: sweep,
    lookupDepositRequest: vi.fn(),
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
  vi.spyOn(f.publicClient, "estimateGas").mockResolvedValue(21000n);
  vi.spyOn(f.publicClient, "getGasPrice").mockResolvedValue(1n);
  vi.spyOn(f.publicClient, "readContract").mockImplementation(({ functionName }) =>
    Promise.resolve(functionName === "decimals" ? 6 : 2000000n),
  );
  const transfer = vi.fn<(input: Erc20Transfer) => Promise<{ hash: Hash; units: bigint }>>();
  const recheck = vi.fn<(input: { hash: Hash }) => Promise<{ hash: Hash; units: bigint }>>();
  vi.spyOn(f.wallet, "transferErc20").mockImplementation(transfer);
  vi.spyOn(f.wallet, "recheckErc20Transfer").mockImplementation(recheck);
  let exposed: Exposed | null = null;
  const expose = (value: Exposed): void => {
    exposed = value;
  };
  const build = (showSurface: boolean): React.JSX.Element => (
    <Harness token={token} client={client} showSurface={showSurface} expose={expose} />
  );
  const view = render(build(true));
  const current = (): Exposed => {
    if (!exposed) throw new Error("Expected the mounted deposit owner");
    return exposed;
  };
  await act(async () => {
    await current().connection.connect({ key: f.provider, create: () => f.wallet });
  });
  await waitFor(() => {
    expect(current().balances.isSuccess).toBe(true);
  });
  return {
    token,
    binding,
    transfer,
    recheck,
    sweep,
    current,
    showSurface: (visible) => {
      view.rerender(build(visible));
    },
    endSession: () => {
      // Released through the real connection owner, so the provider drops the invalidated session
      // exactly as a disconnect or an account change does.
      current().connection.disconnect();
    },
    release: async () => {
      view.unmount();
      client.clear();
      f.wallet.disconnect();
      binding.providers.privateStateProvider.dispose();
      await binding.providers.publicDataProvider.dispose();
      await binding.wallet.disconnect();
    },
  };
}

const rejection = new ProviderRpcError(
  new Error("MetaMask Tx Signature: User denied transaction signature."),
  { code: 4001, shortMessage: "User rejected the request." },
);

const outcomes: {
  name: string;
  submits: boolean;
  /** Invalidates the captured signing session before the failure, as a real disconnect does. */
  endsSession?: boolean;
  failure: () => Error;
  kind: TransferFailureKind;
  recovery: TransferRecovery;
  /** The send control stays blocked, either by the unresolved transfer or by the ended session. */
  sendBlocked: boolean;
  resends: boolean;
}[] = [
  {
    name: "wallet rejection with connector code 4001",
    submits: false,
    failure: () => rejection,
    kind: "rejected",
    recovery: "send-again",
    sendBlocked: false,
    resends: true,
  },
  {
    name: "insufficient gas",
    submits: false,
    failure: () => new Erc20TransferError("fees", "Insufficient native balance for network fees."),
    kind: "fees",
    recovery: "send-again",
    sendBlocked: false,
    resends: true,
  },
  {
    name: "preflight RPC failure",
    submits: false,
    failure: () => new Error("HTTP request failed: fetch failed"),
    kind: "preflight",
    recovery: "send-again",
    sendBlocked: false,
    resends: true,
  },
  {
    name: "wallet or network change",
    submits: false,
    endsSession: true,
    failure: () => new Error("HTTP request failed: fetch failed"),
    kind: "session",
    recovery: "reconnect",
    sendBlocked: true,
    resends: false,
  },
  {
    name: "mined revert",
    submits: true,
    failure: () => new Erc20TransferError("reverted", "The EVM transfer reverted."),
    kind: "reverted",
    recovery: "send-again",
    sendBlocked: false,
    resends: true,
  },
  {
    name: "cancellation or replacement",
    submits: true,
    failure: () =>
      new Erc20TransferError(
        "replaced",
        "The mined transaction replaced or cancelled this token transfer.",
      ),
    kind: "replaced",
    recovery: "recheck",
    sendBlocked: true,
    resends: false,
  },
  {
    name: "receipt timeout",
    submits: true,
    failure: () => new WaitForTransactionReceiptTimeoutError({ hash }),
    kind: "unknown",
    recovery: "recheck",
    sendBlocked: true,
    resends: false,
  },
];

it("covers every recoverable transfer outcome at the surface", () => {
  expect(outcomes.length).toBeGreaterThan(0);
  expect([...new Set(outcomes.map((entry) => entry.kind))].sort()).toEqual(
    ["fees", "unknown", "preflight", "rejected", "replaced", "reverted", "session"].sort(),
  );
});

/** Enters an amount through the real control and waits for the send control to become usable. */
async function enterAmount(surface: Surface, value: string): Promise<HTMLElement> {
  const input = screen.getByLabelText(`Amount to transfer (${surface.token.symbol})`);
  fireEvent.change(input, { target: { value } });
  const send = screen.getByRole("button", { name: "Send tokens to deposit address" });
  await waitFor(() => {
    expect(send.hasAttribute("disabled")).toBe(false);
  });
  return send;
}

it.each(outcomes)(
  "recovers from $name with a bounded end state",
  async ({ submits, endsSession, failure, kind, recovery, sendBlocked, resends }) => {
    const surface = await mountTransferSurface();
    try {
      surface.transfer.mockImplementation((input) => {
        if (submits) input.submitted(hash);
        if (endsSession) surface.endSession();
        return Promise.reject(failure());
      });
      const send = await enterAmount(surface, "1");
      fireEvent.click(send);
      await waitFor(() => {
        expect(surface.current().deposit.transfer?.status).toBe("error");
      });
      const record = surface.current().deposit.transfer;
      expect(record?.failure?.kind).toBe(kind);
      expect(record?.failure?.recovery).toBe(recovery);
      expect(record?.hash).toBe(submits ? hash : undefined);
      expect(surface.current().deposit.unresolved).toBe(recovery === "recheck");
      const amount = screen.getByLabelText(`Amount to transfer (${surface.token.symbol})`);
      expect(amount.hasAttribute("disabled")).toBe(recovery === "recheck");
      expect(send.hasAttribute("disabled")).toBe(sendBlocked);
      const blocked = recovery === "recheck";
      const gate = screen.queryByRole("status", { name: "Deposit transfer availability" });
      const recheckControl = screen.queryByRole("button", { name: "Recheck transfer receipt" });
      expect(gate === null).toBe(!blocked);
      expect(recheckControl === null).toBe(!blocked);
      expect(send.getAttribute("aria-describedby")).toBe(
        blocked ? "deposit-transfer-send-gate" : null,
      );
      const explained = blocked
        ? (gate?.textContent ?? "")
        : screen
            .queryAllByRole("alert")
            .map((panel) => panel.textContent ?? "")
            .join(" ");
      expect(explained).toContain(record?.failure?.message ?? "");
      expect(explained).toContain(record?.failure?.nextAction ?? "");
      // A second send is only reached when the chain has proved that nothing can still settle.
      fireEvent.click(send);
      await act(async () => {
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(surface.transfer).toHaveBeenCalledTimes(resends ? 2 : 1);
      });
      // The owner refuses the same second send on its own, since a disabled control is not ownership.
      // A released session rejects before any transfer, which is the refusal this asserts.
      await act(async () => {
        await surface
          .current()
          .deposit.sendDeposit(surface.binding, surface.token.erc20Address, "1")
          .catch(() => undefined);
      });
      expect(surface.transfer).toHaveBeenCalledTimes(resends ? 3 : 1);
    } finally {
      await surface.release();
    }
  },
);

it("acknowledges a released wallet wait and accepts its late completion without a second send", async () => {
  const surface = await mountTransferSurface();
  try {
    const approval = Promise.withResolvers<undefined>();
    let announce: ((value: Hash) => void) | null = null;
    surface.transfer.mockImplementation(async (input) => {
      announce = input.submitted;
      await approval.promise;
      input.submitted(hash);
      return { hash, units: input.units };
    });
    let sending: Promise<void> | undefined;
    act(() => {
      sending = surface
        .current()
        .deposit.sendDeposit(surface.binding, surface.token.erc20Address, "1");
    });
    await waitFor(() => {
      expect(surface.transfer).toHaveBeenCalledTimes(1);
    });
    expect(announce).not.toBeNull();
    act(() => {
      surface.current().deposit.abandonApproval();
    });
    expect(surface.current().deposit.transfer?.failure?.kind).toBe("abandoned");
    expect(surface.current().deposit.unresolved).toBe(true);
    const send = await screen.findByRole("button", { name: "Send tokens to deposit address" });
    expect(send.hasAttribute("disabled")).toBe(true);
    await act(async () => {
      await surface.current().deposit.sendDeposit(surface.binding, surface.token.erc20Address, "1");
    });
    expect(surface.transfer).toHaveBeenCalledTimes(1);
    await act(async () => {
      approval.resolve(undefined);
      await sending;
    });
    expect(surface.current().deposit.transfer?.status).toBe("confirmed");
    expect(surface.current().deposit.transfer?.hash).toBe(hash);
    expect(surface.current().deposit.transfer?.failure).toBeNull();
    expect(surface.transfer).toHaveBeenCalledTimes(1);
  } finally {
    await surface.release();
  }
});

it.each(["confirmed", "pending"] as const)(
  "rechecks an unresolved submitted transfer as %s",
  async (outcome) => {
    const surface = await mountTransferSurface();
    try {
      surface.transfer.mockImplementation((input) => {
        input.submitted(hash);
        return Promise.reject(new WaitForTransactionReceiptTimeoutError({ hash }));
      });
      await act(async () => {
        await surface
          .current()
          .deposit.sendDeposit(surface.binding, surface.token.erc20Address, "1");
      });
      expect(surface.current().deposit.transfer?.failure?.kind).toBe("unknown");
      surface.recheck.mockImplementation(() =>
        outcome === "confirmed"
          ? Promise.resolve({ hash, units: 1000000n })
          : Promise.reject(
              new Erc20TransferError("unknown", "This transaction has no receipt yet."),
            ),
      );
      await act(async () => {
        await surface.current().deposit.recheckTransfer();
      });
      expect(surface.recheck).toHaveBeenCalledTimes(1);
      expect(surface.current().deposit.transfer?.status).toBe(
        outcome === "confirmed" ? "confirmed" : "error",
      );
      expect(surface.current().deposit.unresolved).toBe(outcome !== "confirmed");
      expect(surface.transfer).toHaveBeenCalledTimes(1);
      const continuation = screen.queryByRole("button", { name: "Continue with Midnight deposit" });
      expect(continuation === null).toBe(outcome !== "confirmed");
    } finally {
      await surface.release();
    }
  },
);

it("admits one sweep continuation from repeated clicks and duplicate entry points", async () => {
  const surface = await mountTransferSurface();
  try {
    surface.transfer.mockImplementation((input) => {
      input.submitted(hash);
      return Promise.resolve({ hash, units: input.units });
    });
    await act(async () => {
      await surface.current().deposit.sendDeposit(surface.binding, surface.token.erc20Address, "1");
    });
    expect(surface.current().deposit.transfer?.status).toBe("confirmed");
    // An established receipt leaves nothing to recheck, so the control is not offered for it.
    expect(screen.queryByRole("button", { name: "Recheck transfer receipt" })).toBeNull();
    const gate = Promise.withResolvers<{ refunded: boolean }>();
    surface.sweep.mockReturnValue(gate.promise);
    let first: Promise<void> | undefined;
    act(() => {
      first = surface.current().deposit.continueDeposit();
      void surface.current().deposit.continueDeposit();
      void surface.current().deposit.continueDeposit();
    });
    expect(surface.sweep).toHaveBeenCalledTimes(1);
    const send = await screen.findByRole("button", { name: "Transfer confirmed" });
    expect(send.hasAttribute("disabled")).toBe(true);
    const continuation = screen.getByRole("button", { name: "Midnight deposit pending…" });
    expect(continuation.hasAttribute("disabled")).toBe(true);
    expect(continuation.getAttribute("aria-describedby")).toBe("deposit-transfer-continue-gate");
    // The sweep is a different transaction with its own observation, so the preparation transfer's
    // receipt recheck stays out of the way while the sweep runs.
    expect(screen.queryByRole("button", { name: "Recheck transfer receipt" })).toBeNull();
    await act(async () => {
      gate.resolve({ refunded: false });
      await first;
    });
    expect(surface.sweep).toHaveBeenCalledTimes(1);
    expect(surface.current().deposit.transfer?.sweep).toBe("complete");
    // The completed record never sends tokens again on a further continuation attempt.
    await act(async () => {
      await surface.current().deposit.continueDeposit();
    });
    expect(surface.sweep).toHaveBeenCalledTimes(1);
    expect(surface.transfer).toHaveBeenCalledTimes(1);
  } finally {
    await surface.release();
  }
});

it("retains a confirmed transfer and its failed continuation across closing the surface", async () => {
  const surface = await mountTransferSurface();
  try {
    surface.transfer.mockImplementation((input) => {
      input.submitted(hash);
      return Promise.resolve({ hash, units: input.units });
    });
    await act(async () => {
      await surface.current().deposit.sendDeposit(surface.binding, surface.token.erc20Address, "1");
    });
    surface.sweep.mockRejectedValue(new Error("Midnight rejected the deposit."));
    await act(async () => {
      await surface.current().deposit.continueDeposit();
    });
    expect(surface.current().deposit.transfer?.sweepError).toBe("Midnight rejected the deposit.");
    expect(surface.current().deposit.transfer?.sweep).toBe("ready");
    act(() => {
      surface.showSurface(false);
    });
    expect(screen.queryByRole("button", { name: "Send tokens to deposit address" })).toBeNull();
    act(() => {
      surface.showSurface(true);
    });
    expect(surface.current().deposit.transfer?.hash).toBe(hash);
    const reopened = await screen.findByRole("button", {
      name: "Continue with Midnight deposit",
    });
    expect(reopened.hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("alert").textContent).toContain("Midnight rejected the deposit.");
    // The retained confirmation continues without sending tokens again.
    surface.sweep.mockResolvedValue({ refunded: false });
    await act(async () => {
      await surface.current().deposit.continueDeposit();
    });
    expect(surface.current().deposit.transfer?.sweep).toBe("complete");
    expect(surface.transfer).toHaveBeenCalledTimes(1);
  } finally {
    await surface.release();
  }
});

it("keeps an unresolved submitted transaction while dismissal clears a safely retryable one", async () => {
  const surface = await mountTransferSurface();
  try {
    surface.transfer.mockImplementation((input) => {
      input.submitted(hash);
      return Promise.reject(new WaitForTransactionReceiptTimeoutError({ hash }));
    });
    await act(async () => {
      await surface.current().deposit.sendDeposit(surface.binding, surface.token.erc20Address, "1");
    });
    act(() => {
      surface.current().deposit.dismissTransfer();
    });
    expect(surface.current().deposit.transfer?.hash).toBe(hash);
    surface.recheck.mockRejectedValue(
      new Erc20TransferError("reverted", "The EVM transfer reverted."),
    );
    await act(async () => {
      await surface.current().deposit.recheckTransfer();
    });
    expect(surface.current().deposit.transfer?.failure?.kind).toBe("reverted");
    expect(surface.current().deposit.unresolved).toBe(false);
    act(() => {
      surface.current().deposit.dismissTransfer();
    });
    expect(surface.current().deposit.transfer).toBeNull();
  } finally {
    await surface.release();
  }
});
