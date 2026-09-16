import { MidnightNetwork } from "@sig-net/midnight";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActivityExplorerLinks } from "@/components/activity-list-table";
import { TransactionDetailsDialog } from "@/components/activity-list-table/transaction-details-dialog";
import { useMidnightTransactions } from "@/hooks/use-midnight-transactions";
import { NETWORK_DEFAULTS, type NetworkId, sepoliaChainConfig } from "@/lib/config/runtime";
import {
  evmExplorerLink,
  type EvmExplorerSource,
  type ExplorerAvailability,
  MIDNIGHT_ADDRESS_UNSUPPORTED,
  midnightExplorerLink,
  PUBLIC_KEY_UNSUPPORTED,
  REQUEST_ID_UNSUPPORTED,
} from "@/lib/explorer";
import { midnightTxHistory, type MidnightTxRecord } from "@/lib/midnight/tx-history";
import { ConfigurationProvider } from "@/providers/configuration-context";
import { MidnightWalletProvider } from "@/providers/midnight-wallet-context";
import { VaultProvider } from "@/providers/vault-context";

import { testRuntimeConfiguration } from "../config/runtime-server-fixture";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const transactionHash = `0x${"ab".repeat(32)}`;
const midnightTransactionHash = "cd".repeat(32);
const evmAddress = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const vaultContract = "aa".repeat(32);
const SEPOLIA: EvmExplorerSource = {
  explorerUrl: "https://sepolia.etherscan.io",
  chainId: 11155111n,
};
const MAINNET: EvmExplorerSource = { explorerUrl: "https://etherscan.io", chainId: 1n };
const LOCAL_FORK: EvmExplorerSource = { explorerUrl: "", chainId: 11155111n };

function unavailableLinks(reason: string): ActivityExplorerLinks {
  const entry: ExplorerAvailability = { status: "unavailable", reason };
  return {
    evmTransaction: entry,
    midnightTransaction: entry,
    fromAddress: entry,
    toAddress: entry,
    vaultContract: entry,
  };
}

describe("EVM explorer routes", () => {
  it("builds verified Etherscan routes for Sepolia and mainnet", () => {
    expect(evmExplorerLink(SEPOLIA, "transaction", transactionHash)).toEqual({
      status: "available",
      href: `https://sepolia.etherscan.io/tx/${transactionHash}`,
      label: "View this transaction on the Sepolia explorer",
    });
    expect(evmExplorerLink(SEPOLIA, "address", evmAddress)).toEqual({
      status: "available",
      href: `https://sepolia.etherscan.io/address/${evmAddress}`,
      label: "View this address on the Sepolia explorer",
    });
    expect(evmExplorerLink(MAINNET, "address", evmAddress)).toEqual({
      status: "available",
      href: `https://etherscan.io/address/${evmAddress}`,
      label: "View this address on the Ethereum explorer",
    });
  });

  it("refuses a public explorer for a local fork that reuses the Sepolia chain ID", () => {
    expect(NETWORK_DEFAULTS.evm.local.explorerUrl).toBe("");
    expect(sepoliaChainConfig(NETWORK_DEFAULTS.evm.local.rpcUrl).explorerUrl).toBe("");
    expect(evmExplorerLink(LOCAL_FORK, "transaction", transactionHash)).toEqual({
      status: "unavailable",
      reason: "No explorer is configured for this network, so this transaction has no link.",
    });
    expect(evmExplorerLink(LOCAL_FORK, "address", evmAddress)).toEqual({
      status: "unavailable",
      reason: "No explorer is configured for this network, so this address has no link.",
    });
  });

  it("keeps a custom origin's path and avoids doubled separators", () => {
    const custom: EvmExplorerSource = {
      explorerUrl: "http://127.0.0.1:4000/fork/",
      chainId: 424242n,
    };
    expect(evmExplorerLink(custom, "transaction", transactionHash)).toEqual({
      status: "available",
      href: `http://127.0.0.1:4000/fork/tx/${transactionHash}`,
      label: "View this transaction on the EVM chain 424242 explorer",
    });
    expect(
      evmExplorerLink(
        { explorerUrl: "https://sepolia.etherscan.io/?ref=x#top", chainId: 11155111n },
        "address",
        evmAddress,
      ),
    ).toEqual({
      status: "available",
      href: `https://sepolia.etherscan.io/address/${evmAddress}`,
      label: "View this address on the Sepolia explorer",
    });
  });

  it.each([
    ["javascript:alert(1)", "The configured explorer URL is not an absolute HTTP(S) address."],
    ["sepolia.etherscan.io", "The configured explorer URL is not an absolute HTTP(S) address."],
  ])("rejects the unsafe explorer origin %s", (origin, reason) => {
    expect(
      evmExplorerLink({ explorerUrl: origin, chainId: 11155111n }, "address", evmAddress),
    ).toEqual({ status: "unavailable", reason });
  });

  it.each([
    ["0xabc", "transaction" as const, "This value is not an EVM transaction identifier."],
    [vaultContract, "transaction" as const, "This value is not an EVM transaction identifier."],
    [transactionHash, "address" as const, "This value is not an EVM address identifier."],
    ["not hexadecimal", "address" as const, "This value is not an EVM address identifier."],
  ])("rejects %s as an EVM %s identifier", (value, subject, reason) => {
    expect(evmExplorerLink(SEPOLIA, subject, value)).toEqual({ status: "unavailable", reason });
  });
});

describe("Midnight explorer routes", () => {
  it.each([
    ["preview", "https://preview.midnightexplorer.com"],
    ["preprod", "https://preprod.midnightexplorer.com"],
    ["mainnet", "https://midnightexplorer.com"],
  ] as const)("builds %s contract and transaction routes", (networkId, origin) => {
    expect(midnightExplorerLink(networkId, "contract", vaultContract)).toEqual({
      status: "available",
      href: `${origin}/contracts/0x${vaultContract}`,
      label: `View this contract on the Midnight ${networkId} explorer`,
    });
    expect(
      midnightExplorerLink(networkId, "transaction", `0x${vaultContract.toUpperCase()}`),
    ).toEqual({
      status: "available",
      href: `${origin}/transactions/0x${vaultContract}`,
      label: `View this transaction on the Midnight ${networkId} explorer`,
    });
  });

  it.each([
    ["undeployed", "Midnight undeployed has no public explorer, so this contract has no link."],
    ["stagenet", "Midnight stagenet has no public explorer, so this contract has no link."],
  ] as const)("reports %s as unsupported with no explorer host", (networkId, reason) => {
    expect(midnightExplorerLink(networkId, "contract", vaultContract)).toEqual({
      status: "unavailable",
      reason,
    });
  });

  it("covers every configurable Midnight network", () => {
    const configured: NetworkId[] = Object.values(MidnightNetwork);
    expect(configured.length).toBeGreaterThan(0);
    const resolved = configured.map(
      (networkId) => midnightExplorerLink(networkId, "contract", vaultContract).status,
    );
    expect(resolved).toEqual(
      ["undeployed", "stagenet", "preview", "preprod", "mainnet"].map((networkId) =>
        networkId === "undeployed" || networkId === "stagenet" ? "unavailable" : "available",
      ),
    );
    expect(configured).toEqual(["undeployed", "stagenet", "preview", "preprod", "mainnet"]);
  });

  it("rejects an unrecorded network and a value that is not a 32-byte identifier", () => {
    expect(midnightExplorerLink(undefined, "contract", vaultContract)).toEqual({
      status: "unavailable",
      reason: "This record has no captured Midnight network, so its contract has no link.",
    });
    expect(midnightExplorerLink("preview", "contract", "0x1234")).toEqual({
      status: "unavailable",
      reason: "This value is not a Midnight contract identifier.",
    });
  });

  it("keeps unsupported identifier kinds copyable with a truthful reason", () => {
    expect(MIDNIGHT_ADDRESS_UNSUPPORTED.status).toBe("unavailable");
    expect(REQUEST_ID_UNSUPPORTED.status).toBe("unavailable");
    expect(PUBLIC_KEY_UNSUPPORTED.status).toBe("unavailable");
  });
});

describe("activity history links", () => {
  const historyRecord = (overrides: Partial<MidnightTxRecord>): MidnightTxRecord => ({
    id: `history-${Math.random().toString(36).slice(2)}`,
    type: "Deposit",
    fromSymbol: "WALLET",
    fromAmount: evmAddress,
    toSymbol: "USDC",
    toAmount: "1 USDC",
    status: "completed",
    timestampRaw: 1,
    evmTxHash: transactionHash,
    ...overrides,
  });

  it("keeps a local record unlinked after the configuration switches to Sepolia", () => {
    const { result } = renderHook(useMidnightTransactions);
    const local = historyRecord({
      explorerUrl: "",
      chainId: 11155111,
      networkId: "undeployed",
      vaultContractAddress: vaultContract,
    });
    act(() => {
      midnightTxHistory.add(local);
    });
    const row = result.current.find((entry) => entry.id === local.id);
    expect(row?.evmTransactionHash).toBe(transactionHash);
    expect(row?.explorer.evmTransaction.status).toBe("unavailable");
    expect(row?.explorer.fromAddress.status).toBe("unavailable");
    expect(row?.explorer.vaultContract).toEqual({
      status: "unavailable",
      reason: "Midnight undeployed has no public explorer, so this contract has no link.",
    });

    act(() => {
      midnightTxHistory.update(local.id, { explorerUrl: "https://sepolia.etherscan.io" });
    });
    const relinked = result.current.find((entry) => entry.id === local.id);
    expect(relinked?.explorer.evmTransaction).toEqual({
      status: "available",
      href: `https://sepolia.etherscan.io/tx/${transactionHash}`,
      label: "View this transaction on the Sepolia explorer",
    });
  });

  it("links each captured leg of a cross-chain record to its own chain", () => {
    const { result } = renderHook(useMidnightTransactions);
    const crossChain = historyRecord({
      type: "Withdraw",
      fromSymbol: "USDC",
      fromAmount: "1 USDC",
      toSymbol: "WALLET",
      toAmount: evmAddress,
      explorerUrl: "https://etherscan.io",
      chainId: 1,
      networkId: "preview",
      vaultContractAddress: vaultContract,
    });
    act(() => {
      midnightTxHistory.add(crossChain);
    });
    const row = result.current.find((entry) => entry.id === crossChain.id);
    expect(row?.explorer.evmTransaction).toEqual({
      status: "available",
      href: `https://etherscan.io/tx/${transactionHash}`,
      label: "View this transaction on the Ethereum explorer",
    });
    expect(row?.explorer.toAddress).toEqual({
      status: "available",
      href: `https://etherscan.io/address/${evmAddress}`,
      label: "View this address on the Ethereum explorer",
    });
    expect(row?.explorer.fromAddress.status).toBe("unavailable");
    expect(row?.explorer.vaultContract).toEqual({
      status: "available",
      href: `https://preview.midnightexplorer.com/contracts/0x${vaultContract}`,
      label: "View this contract on the Midnight preview explorer",
    });
  });
});

describe("transaction details presentation", () => {
  it("explains the missing link and keeps exact copying for a local receipt", () => {
    render(
      <TransactionDetailsDialog
        transaction={{
          id: "local-details",
          type: "Deposit",
          timestamp: "fixture time",
          timestampRaw: 1,
          status: "completed",
          evmTransactionHash: transactionHash,
          explorer: unavailableLinks(
            "No explorer is configured for this network, so this transaction has no link.",
          ),
        }}
        open
        onOpenChange={() => undefined}
      />,
    );

    expect(screen.queryByRole("link")).toBeNull();
    expect(
      screen.getByText(
        "No explorer is configured for this network, so this transaction has no link.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Copy EVM settlement transaction hash" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Show full EVM settlement transaction hash" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Full EVM settlement transaction hash" }).textContent,
    ).toContain(transactionHash);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("opens each supported leg in a new tab with safe attributes", () => {
    render(
      <TransactionDetailsDialog
        transaction={{
          id: "linked-details",
          type: "Deposit",
          timestamp: "fixture time",
          timestampRaw: 1,
          status: "completed",
          evmTransactionHash: transactionHash,
          midnightTransactionHash,
          requestId: "request-fixture",
          explorer: {
            evmTransaction: {
              status: "available",
              href: `https://sepolia.etherscan.io/tx/${transactionHash}`,
              label: "View this transaction on the Sepolia explorer",
            },
            midnightTransaction: {
              status: "available",
              href: `https://preview.midnightexplorer.com/transactions/0x${midnightTransactionHash}`,
              label: "View this transaction on the Midnight preview explorer",
            },
            fromAddress: { status: "unavailable", reason: "No counterparty address is recorded." },
            toAddress: { status: "unavailable", reason: "No counterparty address is recorded." },
            vaultContract: {
              status: "available",
              href: `https://preview.midnightexplorer.com/contracts/0x${vaultContract}`,
              label: "View this contract on the Midnight preview explorer",
            },
          },
        }}
        open
        onOpenChange={() => undefined}
      />,
    );

    const receipt = screen.getByRole("link", {
      name: "View this transaction on the Sepolia explorer: EVM settlement transaction hash",
    });
    expect(receipt.getAttribute("href")).toBe(`https://sepolia.etherscan.io/tx/${transactionHash}`);
    expect(receipt.getAttribute("target")).toBe("_blank");
    expect(receipt.getAttribute("rel")).toBe("noopener noreferrer");

    const claim = screen.getByRole("link", {
      name: "View this transaction on the Midnight preview explorer: Midnight settlement transaction hash",
    });
    expect(claim.getAttribute("href")).toBe(
      `https://preview.midnightexplorer.com/transactions/0x${midnightTransactionHash}`,
    );
    expect(claim.getAttribute("target")).toBe("_blank");
    expect(claim.getAttribute("rel")).toBe("noopener noreferrer");
    expect(
      screen.getByRole("button", { name: "Copy Midnight settlement transaction hash" }),
    ).toBeTruthy();

    const contract = screen.getByRole("link", {
      name: "View this contract on the Midnight preview explorer",
    });
    expect(contract.getAttribute("href")).toBe(
      `https://preview.midnightexplorer.com/contracts/0x${vaultContract}`,
    );
    expect(contract.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByRole("button", { name: "Copy Request ID" })).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: /Request ID/, exact: false } as { name: RegExp }),
    ).toBeNull();
  });
});

describe("activity table isolation", () => {
  it("does not select the row when its explorer link is activated", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const linked: MidnightTxRecord = {
      id: "row-isolation",
      type: "Deposit",
      fromSymbol: "WALLET",
      fromAmount: evmAddress,
      toSymbol: "USDC",
      toAmount: "1 USDC",
      status: "completed",
      timestampRaw: 9_999,
      evmTxHash: transactionHash,
      chainId: 11155111,
      explorerUrl: "https://sepolia.etherscan.io",
      networkId: "preview",
      vaultContractAddress: vaultContract,
    };
    act(() => {
      midnightTxHistory.add(linked);
    });
    const queryClient = new QueryClient();
    const { ActivityListTable } = await import("@/components/activity-list-table");
    const view = render(
      <QueryClientProvider client={queryClient}>
        <ConfigurationProvider initialConfiguration={testRuntimeConfiguration()}>
          <MidnightWalletProvider>
            <VaultProvider>
              <ActivityListTable />
            </VaultProvider>
          </MidnightWalletProvider>
        </ConfigurationProvider>
      </QueryClientProvider>,
    );
    try {
      const [, newestRow] = screen.getAllByRole("row");
      if (!newestRow) throw new Error("Expected the newest activity row");
      const receipt = within(newestRow).getByRole("link", {
        name: /^View this transaction on the Sepolia explorer: Deposit /,
      });
      expect(receipt.getAttribute("href")).toBe(
        `https://sepolia.etherscan.io/tx/${transactionHash}`,
      );
      const wallet = within(newestRow).getByRole("link", {
        name: "View this address on the Sepolia explorer: Wallet address",
      });
      expect(wallet.getAttribute("href")).toBe(
        `https://sepolia.etherscan.io/address/${evmAddress}`,
      );
      fireEvent.click(receipt);
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(wallet);
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(within(newestRow).getByRole("button", { name: "Copy Wallet address" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(newestRow);
      expect(screen.getByRole("dialog")).toBeTruthy();
    } finally {
      view.unmount();
      queryClient.clear();
    }
  });
});
