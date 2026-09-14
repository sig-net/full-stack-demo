import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { DepositDialog } from "@/components/deposit-dialog";
import { NETWORKS_WITH_TOKENS } from "@/lib/constants/token-metadata";
import { describeTransferFailure, Erc20TransferError } from "@/lib/evm/transfer-failure";
import { useEvmDeposit } from "@/providers/evm-deposit-context";
import { useMidnightConnection } from "@/providers/midnight-wallet-context";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

import { account, hash } from "../evm/browser-wallet-fixture";
import { createVaultFixture } from "../sdk/vault-fixture";

vi.mock(import("@/providers/evm-deposit-context"), { spy: true });
vi.mock(import("@/providers/midnight-wallet-context"), { spy: true });
vi.mock(import("@/providers/vault-balances-context"), { spy: true });
vi.mock(import("@/providers/vault-context"), { spy: true });
vi.mock(import("@/providers/vault-operations-context"), { spy: true });
vi.mock(import("@/components/deposit-dialog/token-selection"), () => ({
  TokenSelection: ({ onTokenSelect }) => (
    <button
      type="button"
      onClick={() => {
        const network = NETWORKS_WITH_TOKENS.find((entry) => entry.chain === "ethereum");
        const token = network?.tokens[0];
        if (!network || !token) throw new Error("Expected an EVM deposit choice");
        onTokenSelect(token, network);
      }}
    >
      Select fixture token
    </button>
  ),
}));
vi.mock(import("@/components/deposit-dialog/evm-deposit-address"), () => ({
  EvmDepositAddress: ({ onStartDeposit, showContinue, depositAddress }) => (
    <button
      type="button"
      data-show-continue={showContinue}
      data-deposit-address={depositAddress}
      onClick={() => {
        onStartDeposit(5n);
      }}
    >
      Address continuation
    </button>
  ),
}));
vi.mock(import("@/components/deposit-dialog/evm-deposit-transfer"), () => ({
  EvmDepositTransfer: () => <div>Transfer controls</div>,
}));
vi.mock(import("@/components/deposit-dialog/pending-deposit-recovery"), () => ({
  PendingDepositRecovery: () => <div>Recovery controls</div>,
}));
afterEach(cleanup);

const UNKNOWN_OUTCOME = describeTransferFailure(
  new Erc20TransferError("unknown", "Receipt wait timed out."),
  { submitted: true, sessionChanged: false },
);

it.each(["error", "unresolved-error", "confirmed", "fresh-binding", "complete"] as const)(
  "routes address continuation for %s",
  async (scenario) => {
    const binding = await createVaultFixture();
    const active = scenario === "fresh-binding" ? { ...binding, sessionId: "fresh" } : binding;
    const network = NETWORKS_WITH_TOKENS.find((entry) => entry.chain === "ethereum");
    const token = network?.tokens[0];
    if (!token) throw new Error("Expected a supported token");
    const manual = vi
      .fn<ReturnType<typeof useVaultOperations>["deposit"]>()
      .mockResolvedValue({ refunded: false });
    const continued = vi
      .fn<ReturnType<typeof useEvmDeposit>["continueDeposit"]>()
      .mockResolvedValue(undefined);
    vi.mocked(useVault).mockReturnValue({
      status: "ready",
      error: null,
      binding: active,
      requireBinding: () => active,
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
            vaultUnits: 0n,
            depositUnits: 5n,
            vaultPoolUnits: 0n,
          },
        },
      },
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
      deposit: manual,
      lookupDepositRequest: vi.fn(),
      recoverDeposit: vi.fn(),
      withdraw: vi.fn(),
      swap: vi.fn(),
      supply: vi.fn(),
      redeem: vi.fn(),
    });
    const failed = scenario === "error" || scenario === "unresolved-error";
    vi.mocked(useEvmDeposit).mockReturnValue({
      transfer: {
        binding,
        destination: binding.depositAddress,
        token: token.erc20Address,
        account,
        chainId: 11155111,
        amount: "0.000005",
        hash,
        units: 5n,
        status: failed ? "error" : "confirmed",
        failure: failed ? UNKNOWN_OUTCOME : null,
        sweepError: null,
        abandoned: false,
        sweep: scenario === "complete" ? "complete" : "ready",
      },
      rechecking: false,
      unresolved: scenario === "unresolved-error",
      sendDeposit: vi.fn(),
      continueDeposit: continued,
      recheckTransfer: vi.fn(),
      abandonApproval: vi.fn(),
      dismissTransfer: vi.fn(),
    });
    const onOpenChange = vi.fn();
    const { unmount } = render(<DepositDialog open onOpenChange={onOpenChange} />);
    try {
      fireEvent.click(screen.getByRole("button", { name: "Select fixture token" }));
      const continuation = screen.getByRole("button", { name: "Address continuation" });
      expect(continuation.getAttribute("data-deposit-address")).toBe(active.depositAddress);
      // A confirmed or unresolved submitted transfer keeps the route, so the address entry point
      // cannot start a fresh deposit while that transaction can still settle. The confirmed
      // transfer's own Midnight continuation belongs to the transfer surface that holds its hash.
      const held = scenario === "confirmed" || scenario === "unresolved-error";
      expect(continuation.getAttribute("data-show-continue")).toBe(held ? "false" : "true");
      fireEvent.click(continuation);
      await waitFor(() => {
        expect(manual.mock.calls).toEqual(held ? [] : [[token.erc20Address, 5n]]);
        expect(continued).not.toHaveBeenCalled();
        expect(onOpenChange.mock.calls).toEqual(held ? [] : [[false]]);
      });
    } finally {
      unmount();
      binding.providers.privateStateProvider.dispose();
      await binding.providers.publicDataProvider.dispose();
      await binding.wallet.disconnect();
    }
  },
);
