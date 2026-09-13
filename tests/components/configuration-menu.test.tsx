import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";

import { ConfigurationMenu } from "@/components/configuration-menu";
import { useRuntimeConfigSections } from "@/hooks/use-runtime-config-sections";
import { runtimeFields } from "@/lib/config/runtime";
import { MidnightWalletProvider } from "@/providers/midnight-wallet-context";
import { RuntimeConfigProvider, useRuntimeConfig } from "@/providers/runtime-config-context";

vi.mock(import("@/hooks/use-runtime-config-sections"), { spy: true });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("renders configuration controls and delegates an invalid edit to validation", () => {
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
  fireEvent.change(input, { target: { value: "invalid" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));

  expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  expect(screen.getByText(/absolute URL/)).toBeTruthy();
  expect(screen.getByText(/Server deployment compatibility is unavailable/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  expect(screen.getByText("Draft discarded.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
  expect(screen.getByText("Startup defaults restored.")).toBeTruthy();
});

it("delegates every configuration action and renders wallet endpoint differences", () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("", { status: 500 })));
  const edit = vi.fn<ReturnType<typeof useRuntimeConfigSections>["edit"]>();
  const apply = vi
    .fn<ReturnType<typeof useRuntimeConfigSections>["apply"]>()
    .mockReturnValue(false);
  const discard = vi.fn<ReturnType<typeof useRuntimeConfigSections>["discard"]>();
  const reset = vi.fn<ReturnType<typeof useRuntimeConfigSections>["reset"]>();
  vi.mocked(useRuntimeConfigSections).mockImplementation(function useControlledSections() {
    const runtime = useRuntimeConfig();
    const field = runtimeFields.find((entry) => entry.key === "rpcUrl");
    if (!field) throw new Error("Expected RPC configuration field");
    return {
      ...runtime,
      edit,
      apply,
      discard,
      reset,
      walletError: null,
      serverUnavailable: "Server configuration incompatible",
      sections: [
        {
          title: "EVM",
          fields: [
            {
              ...field,
              value: "invalid",
              appliedValue: "http://localhost:8545",
              error: "Invalid RPC",
              difference: {
                kind: "endpoint",
                message: "Wallet differs.",
                walletValue: "https://wallet.example.invalid",
              },
              options: undefined,
            },
          ],
        },
      ],
    };
  });
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={query}>
      <RuntimeConfigProvider>
        <ConfigurationMenu />
      </RuntimeConfigProvider>
    </QueryClientProvider>,
  );
  try {
    fireEvent.click(screen.getByRole("button", { name: "Configuration" }));
    const input = screen.getByLabelText("RPC URL");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Invalid RPC")).toBeTruthy();
    expect(screen.getByText(/Wallet differs/)).toBeTruthy();
    expect(screen.getByText(/https:\/\/wallet.example.invalid/)).toBeTruthy();
    expect(screen.getByText("Server configuration incompatible")).toBeTruthy();
    fireEvent.change(input, { target: { value: "http://localhost" } });
    expect(edit.mock.calls).toEqual([["rpcUrl", "http://localhost"]]);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(discard).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  } finally {
    view.unmount();
    query.clear();
  }
});
