import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { PendingDepositRecovery } from "@/components/deposit-dialog/pending-deposit-recovery";
import { MIDNIGHT_TOKENS } from "@/lib/constants/token-metadata";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

import { createVaultFixture } from "../sdk/vault-fixture";
import { useReadyMidnightFixture } from "./midnight-readiness-fixture";

vi.mock(import("@/providers/vault-context"), { spy: true });
vi.mock(import("@/providers/vault-operations-context"), { spy: true });
vi.mock(import("@/providers/midnight-readiness-context"), { spy: true });
afterEach(cleanup);

it("keeps confirmed IDs copyable through settlement, errors and reopening while recovery drafts stay independent", async () => {
  const binding = await createVaultFixture();
  const token = MIDNIGHT_TOKENS[0];
  const otherToken = MIDNIGHT_TOKENS[1];
  if (!token || !otherToken) throw new Error("Expected two supported tokens");
  const requestId = "ab".repeat(32);
  const manualId = `0x${"CD".repeat(32)}`;
  const readText = vi.fn<() => Promise<string>>().mockResolvedValue(manualId);
  const writeText = vi.fn<(value: string) => Promise<void>>().mockResolvedValue();
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { readText, writeText },
  });
  const recover = vi
    .fn<ReturnType<typeof useVaultOperations>["recoverDeposit"]>()
    .mockResolvedValue({ refunded: false });
  const operation: ReturnType<typeof useVaultOperations> = {
    currentDeposit: { token: token.erc20Address, requestId: null, status: "pending" },
    log: [],
    busy: true,
    ready: true,
    unavailable: null,
    recoverDeposit: recover,
    deposit: vi.fn(),
    withdraw: vi.fn(),
    swap: vi.fn(),
    supply: vi.fn(),
    redeem: vi.fn(),
  };
  vi.mocked(useVaultOperations).mockImplementation(() => ({ ...operation }));
  const owner: ReturnType<typeof useVault> = {
    status: "ready",
    error: null,
    binding,
    requireBinding: () => binding,
    retry: vi.fn(),
    rebuild: vi.fn(),
    disconnect: vi.fn(),
  };
  vi.mocked(useVault).mockImplementation(() => ({ ...owner }));
  vi.mocked(useMidnightReadiness).mockImplementation(() => useReadyMidnightFixture(binding.wallet));
  const query = new QueryClient();
  const view = render(<PendingDepositRecovery token={token} />, {
    wrapper: ({ children }) => <QueryClientProvider client={query}>{children}</QueryClientProvider>,
  });
  try {
    expect(screen.getByText(/Request ID not available yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Recover pending deposit" })).toHaveProperty(
      "disabled",
      true,
    );
    operation.currentDeposit = { token: token.erc20Address, requestId, status: "pending" };
    view.rerender(<PendingDepositRecovery token={token} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy Deposit request ID" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(requestId);
    });
    expect(screen.getByRole("button", { name: "Copy Deposit request ID" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(screen.getByRole("button", { name: "Use current request" })).toHaveProperty(
      "disabled",
      true,
    );
    operation.busy = false;
    operation.currentDeposit.status = "failed";
    view.rerender(<PendingDepositRecovery token={token} />);
    const input = screen.getByRole("textbox", { name: "Recover a deposit by request ID" });
    fireEvent.change(input, { target: { value: manualId } });
    view.rerender(<PendingDepositRecovery token={token} />);
    expect(input).toHaveProperty("value", manualId);
    fireEvent.click(screen.getByRole("button", { name: "Use current request" }));
    expect(input).toHaveProperty("value", requestId);
    fireEvent.click(screen.getByRole("button", { name: "Paste request ID" }));
    await waitFor(() => {
      expect(input).toHaveProperty("value", manualId);
    });
    fireEvent.click(screen.getByRole("button", { name: "Recover pending deposit" }));
    await waitFor(() => {
      expect(recover).toHaveBeenCalledWith(token.erc20Address, "cd".repeat(32));
    });
    fireEvent.change(input, { target: { value: "invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Recover pending deposit" }));
    await screen.findByRole("alert");
    expect(recover).toHaveBeenCalledTimes(1);
    readText.mockRejectedValueOnce(new Error("NotAllowedError"));
    fireEvent.click(screen.getByRole("button", { name: "Paste request ID" }));
    await screen.findByText(/Unable to read the clipboard/);
    expect(input).toHaveProperty("value", "invalid");
    const delayed = Promise.withResolvers<string>();
    readText.mockReturnValueOnce(delayed.promise);
    fireEvent.click(screen.getByRole("button", { name: "Paste request ID" }));
    fireEvent.change(input, { target: { value: manualId } });
    await act(async () => {
      delayed.resolve(requestId);
      await delayed.promise;
    });
    expect(input).toHaveProperty("value", manualId);
    readText.mockResolvedValueOnce("");
    fireEvent.click(screen.getByRole("button", { name: "Paste request ID" }));
    await screen.findByText(/The clipboard is empty/);
    expect(input).toHaveProperty("value", "");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    fireEvent.click(screen.getByRole("button", { name: "Paste request ID" }));
    await screen.findByText(/Unable to read the clipboard/);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText, writeText },
    });
    operation.currentDeposit.status = "completed";
    view.rerender(<PendingDepositRecovery token={token} />);
    expect(screen.getByText("Confirmed request, deposit completed.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use current request" })).toHaveProperty(
      "disabled",
      true,
    );
    view.rerender(<></>);
    view.rerender(<PendingDepositRecovery token={token} />);
    expect(screen.getByRole("button", { name: "Copy Deposit request ID" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(screen.getByRole("textbox")).toHaveProperty("value", "");
    const staleClipboard = Promise.withResolvers<string>();
    readText.mockReturnValueOnce(staleClipboard.promise);
    fireEvent.click(screen.getByRole("button", { name: "Paste request ID" }));
    view.rerender(<PendingDepositRecovery token={otherToken} />);
    await act(async () => {
      staleClipboard.resolve(manualId);
      await staleClipboard.promise;
    });
    expect(screen.queryByRole("button", { name: "Copy Deposit request ID" })).toBeNull();
    expect(screen.getByRole("textbox")).toHaveProperty("value", "");
    view.rerender(<PendingDepositRecovery token={token} />);
    expect(screen.getByRole("button", { name: "Copy Deposit request ID" })).toHaveProperty(
      "disabled",
      false,
    );
    owner.binding = null;
    operation.currentDeposit = null;
    view.rerender(<PendingDepositRecovery token={token} />);
    expect(screen.queryByRole("button", { name: "Copy Deposit request ID" })).toBeNull();
    expect(screen.getByRole("textbox")).toHaveProperty("value", "");
  } finally {
    view.unmount();
    query.clear();
    binding.providers.privateStateProvider.dispose();
    await binding.providers.publicDataProvider.dispose();
  }
});
