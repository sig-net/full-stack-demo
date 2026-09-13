import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { VaultIdentityButton, VaultIdentityHelp } from "@/components/vault-identity-controls";
import { useVault } from "@/providers/vault-context";
import { useVaultIdentity, VaultIdentityProvider } from "@/providers/vault-identity-context";

vi.mock(import("@/providers/vault-context"), { spy: true });
afterEach(cleanup);
beforeEach(() => {
  vi.mocked(useVault).mockReturnValue({
    status: "disconnected",
    error: null,
    binding: null,
    requireBinding: vi.fn(),
    retry: vi.fn(),
    rebuild: vi.fn(),
    disconnect: vi.fn(),
  });
});

it("owns one validated identity without wallet, configuration or query providers", () => {
  const view = renderHook(() => ({ first: useVaultIdentity(), second: useVaultIdentity() }), {
    wrapper: VaultIdentityProvider,
  });
  const invalidated = vi.fn();
  const unsubscribe = view.result.current.first.onInvalidate(invalidated);
  act(() => {
    view.result.current.first.setIdentitySecret(` 0X${"A1".repeat(32)} `);
  });
  expect(view.result.current.second.identitySecret).toBe("a1".repeat(32));
  expect(invalidated).toHaveBeenCalledTimes(1);
  act(() => {
    view.result.current.second.setIdentitySecret("a1".repeat(32));
  });
  expect(invalidated).toHaveBeenCalledTimes(1);
  expect(() => {
    view.result.current.first.setIdentitySecret("bad");
  }).toThrow("32-byte");
  expect(view.result.current.first.getIdentitySecret()).toBe("a1".repeat(32));
  act(() => {
    view.result.current.second.clearIdentity();
  });
  expect(view.result.current.first.identitySecret).toBe("");
  expect(invalidated).toHaveBeenCalledTimes(2);
  unsubscribe();
  act(() => {
    view.result.current.first.setIdentitySecret("02".repeat(32));
  });
  expect(invalidated).toHaveBeenCalledTimes(2);
  const read = view.result.current.first.getIdentitySecret;
  view.unmount();
  expect(read()).toBe("");
});

it("shares applied status across both editors and discards drafts with focus return", async () => {
  render(
    <VaultIdentityProvider>
      <div aria-label="Toolbar" role="group">
        <VaultIdentityButton />
      </div>
      <div aria-label="Home" role="group">
        <VaultIdentityButton />
      </div>
    </VaultIdentityProvider>,
  );
  const toolbar = within(screen.getByRole("group", { name: "Toolbar" }));
  const home = within(screen.getByRole("group", { name: "Home" }));
  const toolbarTrigger = toolbar.getByRole("button", { name: "Vault identity: not set" });
  fireEvent.click(toolbarTrigger);
  const firstInputId = screen.getByLabelText("Vault secret").id;
  expect(screen.getByLabelText("Vault secret").getAttribute("type")).toBe("password");
  expect(screen.getByRole("button", { name: "Use vault secret" }).hasAttribute("disabled")).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: "Generate secret" }));
  expect(screen.getAllByRole("button", { name: "Vault identity: not set" })).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => {
    expect(document.activeElement).toBe(toolbarTrigger);
  });
  fireEvent.click(home.getByRole("button", { name: "Vault identity: not set" }));
  expect(screen.getByLabelText("Vault secret").id).not.toBe(firstInputId);
  expect(screen.getByLabelText("Vault secret").getAttribute("value")).toBe("");
  fireEvent.change(screen.getByLabelText("Vault secret"), { target: { value: "bad" } });
  fireEvent.click(screen.getByRole("button", { name: "Use vault secret" }));
  expect(screen.getByRole("alert").textContent).toContain("32-byte");
  fireEvent.change(screen.getByLabelText("Vault secret"), { target: { value: "03".repeat(32) } });
  fireEvent.click(screen.getByRole("button", { name: "Use vault secret" }));
  await waitFor(() => {
    expect(screen.queryByLabelText("Vault secret")).toBeNull();
  });
  expect(screen.getAllByRole("button", { name: "Vault identity: set" })).toHaveLength(2);
  fireEvent.click(toolbar.getByRole("button", { name: "Vault identity: set" }));
  fireEvent.change(screen.getByLabelText("Vault secret"), { target: { value: "04".repeat(32) } });
  fireEvent.keyDown(screen.getByLabelText("Vault secret"), { key: "Escape" });
  await waitFor(() => {
    expect(document.activeElement).toBe(toolbarTrigger);
  });
  fireEvent.click(home.getByRole("button", { name: "Vault identity: set" }));
  expect(screen.getByLabelText("Vault secret").getAttribute("value")).toBe("03".repeat(32));
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear vault identity" }));
  expect(screen.getAllByRole("button", { name: "Vault identity: not set" })).toHaveLength(2);
});

it("retains loading and retry feedback in the identity surface and clickable help", async () => {
  const retry = vi.fn();
  vi.mocked(useVault).mockReturnValue({
    status: "error",
    error: "Binding failed",
    binding: null,
    requireBinding: vi.fn(),
    retry,
    rebuild: vi.fn(),
    disconnect: vi.fn(),
  });
  render(
    <VaultIdentityProvider>
      <VaultIdentityButton />
      <VaultIdentityHelp />
    </VaultIdentityProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Vault identity: not set" }));
  expect(screen.getByRole("alert").textContent).toBe("Binding failed");
  expect(screen.getByText(/Deposits transfer on EVM first/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry vault" }));
  expect(retry).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => {
    expect(screen.queryByLabelText("Vault secret")).toBeNull();
  });
  fireEvent.click(screen.getByRole("button", { name: "About vault identity" }));
  expect(screen.getByText("Keep your vault secret")).toBeTruthy();
  expect(screen.getByText(/completion of a pending deposit/)).toBeTruthy();
});
