import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WithdrawToken } from "@/components/withdraw-dialog";
import { AmountInput } from "@/components/withdraw-dialog/amount-input";
import { ConfigurationProvider } from "@/providers/configuration-context";

import { testRuntimeConfiguration } from "../config/runtime-server-fixture";

afterEach(cleanup);

const tokenA: WithdrawToken = {
  symbol: "USDC",
  name: "USD Coin",
  chain: "midnight",
  chainName: "Midnight",
  address: "00".repeat(20),
  balance: "12.3456",
  decimals: 4,
};

const tokenB: WithdrawToken = {
  symbol: "DAI",
  name: "Dai Stablecoin",
  chain: "midnight",
  chainName: "Midnight",
  address: "11".repeat(20),
  balance: "7.5",
  decimals: 2,
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function TestProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigurationProvider initialConfiguration={testRuntimeConfiguration()}>
        {children}
      </ConfigurationProvider>
    </QueryClientProvider>
  );
}

function renderAmountInput(
  onSubmit: (data: { token: WithdrawToken; amount: string; receiverAddress: string }) => void,
  preSelectedToken?: WithdrawToken | null,
): ReturnType<typeof render> {
  return render(
    <AmountInput
      availableTokens={[tokenA, tokenB]}
      transactionReady
      onSubmit={onSubmit}
      preSelectedToken={preSelectedToken}
    />,
    { wrapper: TestProviders },
  );
}

async function selectToken(symbol: string): Promise<void> {
  const trigger = screen.getByRole("button", { name: "Select token" });
  fireEvent.pointerDown(trigger, { button: 0 });
  await waitFor(() => {
    expect(screen.getByRole("menuitem", { name: new RegExp(symbol) })).toBeTruthy();
  });
  fireEvent.click(screen.getByRole("menuitem", { name: new RegExp(symbol) }));
}

function selectedTokenButton(): HTMLElement {
  return screen.getByRole("button", { name: "Select token" });
}

describe("AmountInput token selection and exact amounts", () => {
  it("replaces the initial selection when a non-null preselection is supplied", async () => {
    const onSubmit = vi.fn();
    const view = renderAmountInput(onSubmit, tokenA);

    expect(selectedTokenButton().textContent).toContain("USDC");
    const replacement = { ...tokenB };
    view.rerender(
      <AmountInput
        availableTokens={[tokenA, tokenB]}
        transactionReady
        onSubmit={onSubmit}
        preSelectedToken={replacement}
      />,
    );

    await waitFor(() => {
      expect(selectedTokenButton().textContent).toContain("DAI");
    });
  });

  it("keeps the current selection when a preselection is cleared", async () => {
    const onSubmit = vi.fn();
    const view = renderAmountInput(onSubmit, tokenA);
    await selectToken("DAI");

    view.rerender(
      <AmountInput
        availableTokens={[tokenA, tokenB]}
        transactionReady
        onSubmit={onSubmit}
        preSelectedToken={undefined}
      />,
    );

    await waitFor(() => {
      expect(selectedTokenButton().textContent).toContain("DAI");
    });
  });

  it("keeps a user selection through rerenders with the same preselection identity", async () => {
    const onSubmit = vi.fn();
    const view = renderAmountInput(onSubmit, tokenA);
    await selectToken("DAI");

    view.rerender(
      <AmountInput
        availableTokens={[tokenA, tokenB]}
        transactionReady
        onSubmit={onSubmit}
        preSelectedToken={tokenA}
      />,
    );

    await waitFor(() => {
      expect(selectedTokenButton().textContent).toContain("DAI");
    });
  });

  it("lets a changed non-null preselection supersede a user selection", async () => {
    const onSubmit = vi.fn();
    const view = renderAmountInput(onSubmit, tokenA);
    await selectToken("DAI");

    view.rerender(
      <AmountInput
        availableTokens={[tokenA, tokenB]}
        transactionReady
        onSubmit={onSubmit}
        preSelectedToken={{ ...tokenA }}
      />,
    );

    await waitFor(() => {
      expect(selectedTokenButton().textContent).toContain("USDC");
    });
  });

  it("passes the entered amount string unchanged to the submit callback", async () => {
    const onSubmit = vi.fn();
    renderAmountInput(onSubmit, tokenA);
    fireEvent.change(screen.getByRole("textbox", { name: "Token amount" }), {
      target: { value: "1.2300" },
    });
    fireEvent.change(screen.getByPlaceholderText("Recipient address"), {
      target: { value: "midnight1receiver" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        token: tokenA,
        amount: "1.2300",
        receiverAddress: "midnight1receiver",
      });
    });
  });

  it("rejects amounts above the selected balance", async () => {
    const onSubmit = vi.fn();
    renderAmountInput(onSubmit, tokenA);
    fireEvent.change(screen.getByRole("textbox", { name: "Token amount" }), {
      target: { value: "12.3457" },
    });
    fireEvent.change(screen.getByPlaceholderText("Recipient address"), {
      target: { value: "midnight1receiver" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText("Amount exceeds available balance")).toBeTruthy();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
