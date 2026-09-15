import { parseRequestIdHex } from "@sig-net/midnight";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { PendingDepositRecovery } from "@/components/deposit-dialog/pending-deposit-recovery";
import { MIDNIGHT_TOKENS } from "@/lib/constants/token-metadata";
import type { DepositLookup, DepositLookupKind } from "@/lib/midnight/deposit-lookup";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

import { createVaultFixture } from "../sdk/vault-fixture";
import { useReadyMidnightFixture } from "./midnight-readiness-fixture";

vi.mock(import("@/providers/vault-context"), { spy: true });
vi.mock(import("@/providers/vault-operations-context"), { spy: true });
vi.mock(import("@/providers/midnight-readiness-context"), { spy: true });
afterEach(cleanup);

const HEX_REQUEST_ID = /^(0x)?[0-9a-fA-F]{64}$/;

function syntaxLookup(id: string): DepositLookup {
  return HEX_REQUEST_ID.test(id)
    ? { kind: "recoverable", requestId: parseRequestIdHex(id), units: 1000000n }
    : { kind: "malformed" };
}

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
  const lookup = vi
    .fn<ReturnType<typeof useVaultOperations>["lookupDepositRequest"]>()
    .mockImplementation((_erc20, id) => Promise.resolve(syntaxLookup(id)));
  const operation: ReturnType<typeof useVaultOperations> = {
    currentDeposit: { token: token.erc20Address, requestId: null, status: "pending" },
    log: [],
    busy: true,
    ready: true,
    unavailable: null,
    lookupDepositRequest: lookup,
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

it("asks for a confirmed request ID to be saved while the deposit can still need it", async () => {
  const binding = await createVaultFixture();
  const token = MIDNIGHT_TOKENS[0];
  if (!token) throw new Error("Expected a supported token");
  const requestId = "ab".repeat(32);
  const writeText = vi.fn<(value: string) => Promise<void>>().mockResolvedValue();
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { readText: vi.fn(), writeText },
  });
  const operation: ReturnType<typeof useVaultOperations> = {
    currentDeposit: { token: token.erc20Address, requestId: null, status: "pending" },
    log: [],
    busy: true,
    ready: true,
    unavailable: null,
    lookupDepositRequest: vi.fn(),
    recoverDeposit: vi.fn(),
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
  const warning = (): HTMLElement =>
    screen.getByRole("status", { name: "Deposit request ID safekeeping" });
  try {
    expect(screen.queryByRole("status", { name: "Deposit request ID safekeeping" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy request ID" })).toBeNull();

    operation.currentDeposit = { token: token.erc20Address, requestId, status: "pending" };
    view.rerender(<PendingDepositRecovery token={token} />);
    expect(warning().textContent).toContain("Save this deposit request ID.");
    expect(warning().textContent).toContain("before closing or refreshing this page");
    expect(warning().textContent).toContain(
      "needs the same vault secret, network, vault deployment and token",
    );
    expect(warning().textContent).toContain("rather than the only one");
    expect(screen.getByRole("button", { name: "Copy request ID" })).toHaveProperty(
      "disabled",
      false,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy request ID" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(requestId);
    });
    // The copied state is published after the awaited clipboard write resolves, one tick later.
    await waitFor(() => {
      expect(warning().textContent).toContain("Copied to the clipboard.");
    });
    expect(warning().textContent).toContain("Store it somewhere that survives closing this page.");

    writeText.mockRejectedValueOnce(new Error("Clipboard write refused"));
    fireEvent.click(screen.getByRole("button", { name: "Copy request ID" }));
    await screen.findByText("Clipboard write refused");
    expect(warning().textContent).not.toContain("Copied to the clipboard.");
    expect(warning().textContent).toContain("Save this deposit request ID.");

    operation.currentDeposit = { token: token.erc20Address, requestId, status: "failed" };
    view.rerender(<PendingDepositRecovery token={token} />);
    expect(warning().textContent).toContain("Save this deposit request ID.");

    view.rerender(<></>);
    view.rerender(<PendingDepositRecovery token={token} />);
    expect(warning().textContent).toContain("Save this deposit request ID.");

    operation.currentDeposit = { token: token.erc20Address, requestId, status: "completed" };
    view.rerender(<PendingDepositRecovery token={token} />);
    expect(warning().textContent).toContain("Deposit completed. Keep this request ID");
    expect(warning().textContent).not.toContain("Save this deposit request ID.");
    expect(screen.getByRole("button", { name: "Copy request ID" })).toHaveProperty(
      "disabled",
      false,
    );

    owner.binding = null;
    operation.currentDeposit = null;
    view.rerender(<PendingDepositRecovery token={token} />);
    expect(screen.queryByRole("status", { name: "Deposit request ID safekeeping" })).toBeNull();
  } finally {
    view.unmount();
    query.clear();
    binding.providers.privateStateProvider.dispose();
    await binding.providers.publicDataProvider.dispose();
  }
});

const LOOKUP_CASES: readonly {
  kind: DepositLookupKind;
  outcome: DepositLookup;
  summary: string;
  role: "alert" | "status";
  recovers: boolean;
}[] = [
  {
    kind: "recoverable",
    outcome: {
      kind: "recoverable",
      requestId: parseRequestIdHex("ab".repeat(32)),
      units: 1000000n,
    },
    summary: "This deposit request can be resumed.",
    role: "status",
    recovers: true,
  },
  {
    kind: "completed",
    outcome: { kind: "completed", requestId: parseRequestIdHex("ab".repeat(32)) },
    summary: "Already completed.",
    role: "status",
    recovers: false,
  },
  {
    kind: "not-found",
    outcome: { kind: "not-found", requestId: parseRequestIdHex("ab".repeat(32)) },
    summary: "No pending deposit found for this request in the selected vault and network.",
    role: "status",
    recovers: false,
  },
  {
    kind: "mismatched",
    outcome: {
      kind: "mismatched",
      requestId: parseRequestIdHex("ab".repeat(32)),
      mismatch: "identity",
    },
    summary: "This pending deposit belongs to another vault identity.",
    role: "status",
    recovers: false,
  },
  {
    kind: "mismatched",
    outcome: {
      kind: "mismatched",
      requestId: parseRequestIdHex("ab".repeat(32)),
      mismatch: "token",
    },
    summary: "This pending deposit uses a different token.",
    role: "status",
    recovers: false,
  },
  {
    kind: "mismatched",
    outcome: {
      kind: "mismatched",
      requestId: parseRequestIdHex("ab".repeat(32)),
      mismatch: "deployment",
    },
    summary: "The selected vault deployment holds no initialised vault.",
    role: "status",
    recovers: false,
  },
  {
    kind: "malformed",
    outcome: { kind: "malformed" },
    summary: "That is not a deposit request ID.",
    role: "alert",
    recovers: false,
  },
  {
    kind: "error",
    outcome: { kind: "error", cause: "indexer unavailable" },
    summary: "The deposit request ID could not be checked.",
    role: "alert",
    recovers: false,
  },
];

it.each(LOOKUP_CASES)(
  "reports the $kind lookup outcome and only recovers a recoverable request",
  async ({ outcome, summary, role, recovers }) => {
    const binding = await createVaultFixture();
    const token = MIDNIGHT_TOKENS[0];
    if (!token) throw new Error("Expected a supported token");
    const resolution = Promise.withResolvers<DepositLookup>();
    const lookup = vi
      .fn<ReturnType<typeof useVaultOperations>["lookupDepositRequest"]>()
      .mockReturnValue(resolution.promise);
    const recover = vi
      .fn<ReturnType<typeof useVaultOperations>["recoverDeposit"]>()
      .mockResolvedValue({ refunded: false });
    const operation: ReturnType<typeof useVaultOperations> = {
      currentDeposit: null,
      log: [],
      busy: false,
      ready: true,
      unavailable: null,
      lookupDepositRequest: lookup,
      recoverDeposit: recover,
      deposit: vi.fn(),
      withdraw: vi.fn(),
      swap: vi.fn(),
      supply: vi.fn(),
      redeem: vi.fn(),
    };
    vi.mocked(useVaultOperations).mockImplementation(() => ({ ...operation }));
    vi.mocked(useVault).mockImplementation(() => ({
      status: "ready",
      error: null,
      binding,
      requireBinding: () => binding,
      retry: vi.fn(),
      rebuild: vi.fn(),
      disconnect: vi.fn(),
    }));
    vi.mocked(useMidnightReadiness).mockImplementation(() =>
      useReadyMidnightFixture(binding.wallet),
    );
    const query = new QueryClient();
    const view = render(<PendingDepositRecovery token={token} />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={query}>{children}</QueryClientProvider>
      ),
    });
    try {
      const input = screen.getByRole("textbox", { name: "Recover a deposit by request ID" });
      fireEvent.change(input, { target: { value: "ab".repeat(32) } });
      fireEvent.click(screen.getByRole("button", { name: "Recover pending deposit" }));
      const looking = await screen.findByRole("status", { name: "Deposit request lookup" });
      expect(looking.textContent).toContain("Checking this deposit request ID.");
      expect(lookup).toHaveBeenCalledWith(token.erc20Address, "ab".repeat(32));
      expect(recover).not.toHaveBeenCalled();
      await act(async () => {
        resolution.resolve(outcome);
        await resolution.promise;
      });
      const panel = await screen.findByRole(role, { name: "Deposit request lookup" });
      expect(panel.textContent).toContain(summary);
      expect(recover.mock.calls.length).toBe(recovers ? 1 : 0);
    } finally {
      view.unmount();
      query.clear();
      binding.providers.privateStateProvider.dispose();
      await binding.providers.publicDataProvider.dispose();
    }
  },
);
