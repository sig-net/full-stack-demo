import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";

import { ConfigurationMenu } from "@/components/configuration-menu";
import { MidnightWalletProvider } from "@/providers/midnight-wallet-context";
import { RuntimeConfigProvider } from "@/providers/runtime-config-context";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("keeps incomplete configuration editable, rejects invalid values and stages network defaults until Apply", () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("", { status: 500 })));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RuntimeConfigProvider>
        <MidnightWalletProvider>
          <ConfigurationMenu />
        </MidnightWalletProvider>
      </RuntimeConfigProvider>
    </QueryClientProvider>,
  );
  onTestFinished(() => {
    view.unmount();
    queryClient.clear();
  });
  fireEvent.click(screen.getByRole("button", { name: "Configuration" }));
  const input = screen.getByLabelText("RPC URL");
  expect(input.getAttribute("value")).toBe("http://127.0.0.1:8545");
  expect(screen.getByLabelText("Signet contract address")).toBeTruthy();
  fireEvent.change(input, { target: { value: "invalid" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  expect(screen.getByText("Draft discarded.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Network"), { target: { value: "stagenet" } });
  expect(screen.getByText(/Connected network: undeployed/)).toBeTruthy();
  expect(screen.getByLabelText("Indexer URL").getAttribute("value")).toContain("stagenet");
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(screen.getByText("Configuration applied.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reset to network defaults" }));
  expect(screen.getByText("Network defaults prepared. Apply to commit them.")).toBeTruthy();
});
