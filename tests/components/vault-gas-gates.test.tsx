import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import type * as React from "react";
import { StrictMode } from "react";
import { getAddress } from "viem";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { EvmDepositTransfer } from "@/components/deposit-dialog/evm-deposit-transfer";
import { SwapWidget } from "@/components/swap-widget";
import { WithdrawDialog, type WithdrawToken } from "@/components/withdraw-dialog";
import { useMidnightHistory } from "@/hooks/use-midnight-history";
import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import { useVaultGasReserves } from "@/hooks/use-vault-gas-reserves";
import * as tokenMetadata from "@/lib/constants/token-metadata";
import { MIDNIGHT_TOKENS, type TokenConfig } from "@/lib/constants/token-metadata";
import { MPC_OPERATION_ETH_RESERVE } from "@/lib/midnight/evm-envelope";
import { AAVE_USDC, stataAssetsPerShare, stataSupplyApy } from "@/lib/midnight/evm-stata";
import { discoverSwappablePairs, pairKey, quoteBestFeeExactInput } from "@/lib/midnight/evm-swap";
import { flow } from "@/lib/midnight/flow";
import * as vault from "@/lib/midnight/vault";
import type { VaultBalances } from "@/lib/midnight/vault-balances";
import { EvmBalancesProvider } from "@/providers/evm-balances-context";
import { EvmDepositProvider } from "@/providers/evm-deposit-context";
import { EvmLocalFundingProvider, useEvmLocalFunding } from "@/providers/evm-local-funding-context";
import { EvmWalletProvider, useEvmWallet } from "@/providers/evm-wallet-context";
import { LocalFaucetProvider } from "@/providers/local-faucet-context";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";
import { RuntimeConfigProvider } from "@/providers/runtime-config-context";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations, VaultOperationsProvider } from "@/providers/vault-operations-context";

import { LOCAL_FAUCET_DESCRIPTOR_FIXTURE } from "../config/local-faucet-fixture";
import {
  mockMatchingRuntimeServer,
  testRuntimeConfiguration,
} from "../config/runtime-server-fixture";
import { browserWalletFixture } from "../evm/browser-wallet-fixture";
import { startRpcStub } from "../evm/rpc-stub";
import { createVaultFixture } from "../sdk/vault-fixture";
import { useReadyMidnightFixture } from "./midnight-readiness-fixture";
import { FUNDED_RESERVE_WEI, vaultGasReservesFixture } from "./vault-gas-fixture";

vi.mock(import("@/hooks/use-midnight-history"), { spy: true });
vi.mock(import("@/hooks/use-midnight-progress"), { spy: true });
vi.mock(import("@/hooks/use-vault-gas-reserves"), { spy: true });
vi.mock(import("@/lib/constants/token-metadata"), { spy: true });
vi.mock(import("@/lib/midnight/evm-stata"), { spy: true });
vi.mock(import("@/lib/midnight/evm-swap"), { spy: true });
vi.mock(import("@/lib/midnight/vault"), { spy: true });
vi.mock(import("@/providers/midnight-readiness-context"), { spy: true });
vi.mock(import("@/providers/vault-balances-context"), { spy: true });
vi.mock(import("@/providers/vault-context"), { spy: true });
vi.mock(import("@/components/evm-wallet-button"), () => ({
  EvmWalletButton: () => <button type="button">Fixture wallet</button>,
}));

const CHAIN_ID = 11155111n;
const SEND_GATE = "Deposit transfer availability";
const SWAP_GATE = "Vault ETH reserve for swapping";
const WITHDRAW_GATE = "Vault ETH reserve for sending";

beforeEach(() => {
  vi.mocked(useVaultGasReserves).mockReturnValue(vaultGasReservesFixture());
});

afterEach(() => {
  cleanup();
  flow.reset();
});

const withdrawToken: WithdrawToken = {
  symbol: "USDC",
  name: "USD Coin",
  chain: "midnight",
  chainName: "Midnight",
  address: AAVE_USDC,
  balance: "2.000000",
  decimals: 6,
};

interface VaultSurface {
  observe: (vaultWei: bigint | undefined, failed?: boolean) => void;
  close: () => Promise<void>;
}

async function mountVaultSurface(content: React.ReactNode): Promise<VaultSurface> {
  const binding = await createVaultFixture();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS", binding.environment.contractAddress);
  vi.stubEnv(
    "NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS",
    binding.environment.signetContractAddress,
  );
  vi.stubEnv("NEXT_PUBLIC_MPC_SECP256K1_PUBKEY", binding.environment.mpcSecpPub);
  mockMatchingRuntimeServer();
  const balances: VaultBalances = { night: 0n, dust: 0n, perToken: {} };
  for (const token of MIDNIGHT_TOKENS)
    balances.perToken[token.erc20Address.toLowerCase()] = {
      decimals: 6,
      vaultUnits: 1_000_000_000n,
      depositUnits: 0n,
      vaultPoolUnits: 0n,
    };
  const swappable = MIDNIGHT_TOKENS.filter((token) => !token.noSwap);
  vi.mocked(discoverSwappablePairs).mockResolvedValue(
    new Set(
      swappable.flatMap((a) =>
        swappable.filter((b) => a !== b).map((b) => pairKey(a.erc20Address, b.erc20Address)),
      ),
    ),
  );
  vi.mocked(quoteBestFeeExactInput).mockResolvedValue({ fee: 500n, amountOut: 200_000_000n });
  vi.mocked(stataAssetsPerShare).mockResolvedValue(1);
  vi.mocked(stataSupplyApy).mockResolvedValue(0.03);
  vi.mocked(useMidnightHistory).mockReturnValue([]);
  vi.mocked(useMidnightProgress).mockReturnValue({ active: false, message: "", error: null });
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
    balances,
    loading: false,
    checkedAt: null,
    error: null,
    refresh: vi.fn(),
  });
  vi.mocked(useMidnightReadiness).mockImplementation(function useFixtureReadiness() {
    return useReadyMidnightFixture(binding.wallet);
  });
  const tree = (): React.JSX.Element => (
    <QueryClientProvider client={client}>
      <RuntimeConfigProvider initialConfiguration={testRuntimeConfiguration()}>
        <LocalFaucetProvider descriptor={LOCAL_FAUCET_DESCRIPTOR_FIXTURE}>
          <EvmWalletProvider>
            <EvmBalancesProvider tokens={[]}>
              <EvmLocalFundingProvider>
                <VaultOperationsProvider>{content}</VaultOperationsProvider>
              </EvmLocalFundingProvider>
            </EvmBalancesProvider>
          </EvmWalletProvider>
        </LocalFaucetProvider>
      </RuntimeConfigProvider>
    </QueryClientProvider>
  );
  const mounted = render(tree());
  return {
    observe: (vaultWei, failed) => {
      vi.mocked(useVaultGasReserves).mockReturnValue(
        vaultGasReservesFixture({ vault: vaultWei, vaultFailed: failed }),
      );
      act(() => {
        mounted.rerender(tree());
      });
    },
    close: async () => {
      cleanup();
      client.clear();
      binding.providers.privateStateProvider.dispose();
      await binding.providers.publicDataProvider.dispose();
      await binding.wallet.disconnect();
    },
  };
}

it("blocks a swap on a reserve below the swap envelope and its router approval", async () => {
  const surface = await mountVaultSurface(<SwapWidget />);
  try {
    const swapButton = await screen.findByRole("button", { name: "Swap" });
    const [swapAmount] = screen.getAllByRole("textbox", { name: "Token amount" });
    if (!swapAmount) throw new Error("Expected the swap amount input");
    fireEvent.change(swapAmount, { target: { value: "1" } });
    await waitFor(() => {
      expect(swapButton).toHaveProperty("disabled", false);
    });
    expect(screen.queryByRole("status", { name: SWAP_GATE })).toBeNull();
    expect(swapButton.getAttribute("aria-describedby")).toBeNull();

    surface.observe(MPC_OPERATION_ETH_RESERVE.swap - 1n);

    expect(swapButton).toHaveProperty("disabled", true);
    expect(swapButton.getAttribute("aria-describedby")).toBe("swap-vault-gas-gate");
    const panel = screen.getByRole("status", { name: SWAP_GATE });
    expect(within(panel).getByText(/below the reserve needed/)).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Refresh ETH balance" })).toBeTruthy();
    expect(swapAmount).toHaveProperty("value", "1");
  } finally {
    await surface.close();
  }
});

it("blocks the withdrawal submission on an empty or unreadable vault reserve", async () => {
  const surface = await mountVaultSurface(
    <WithdrawDialog open onOpenChange={() => undefined} availableTokens={[withdrawToken]} />,
  );
  try {
    const sendButton = await screen.findByRole("button", { name: "Send" });
    fireEvent.change(screen.getByPlaceholderText("Recipient address"), {
      target: { value: "0x5706bf8b89a121E267591aB29A472B22B11dc82b" },
    });
    const [withdrawAmount] = screen.getAllByRole("textbox", { name: "Token amount" });
    if (!withdrawAmount) throw new Error("Expected the withdrawal amount input");
    fireEvent.change(withdrawAmount, { target: { value: "1" } });
    await waitFor(() => {
      expect(sendButton).toHaveProperty("disabled", false);
    });

    // The same reserve that blocks a swap still covers the smaller withdrawal envelope.
    surface.observe(MPC_OPERATION_ETH_RESERVE.swap - 1n);
    expect(sendButton).toHaveProperty("disabled", false);
    expect(screen.queryByRole("status", { name: WITHDRAW_GATE })).toBeNull();

    surface.observe(0n);
    expect(sendButton).toHaveProperty("disabled", true);
    expect(sendButton.getAttribute("aria-describedby")).toBe("withdraw-vault-gas-gate");
    expect(
      within(screen.getByRole("status", { name: WITHDRAW_GATE })).getByText(/holds no ETH/),
    ).toBeTruthy();

    surface.observe(undefined, true);
    expect(sendButton).toHaveProperty("disabled", true);
    expect(
      within(screen.getByRole("alert", { name: WITHDRAW_GATE })).getByText(/could not be read/),
    ).toBeTruthy();
    expect(withdrawAmount).toHaveProperty("value", "1");
  } finally {
    await surface.close();
  }
});

interface DepositSurface {
  token: TokenConfig;
  funding: () => ReturnType<typeof useEvmLocalFunding>;
  observe: (depositWei: bigint | undefined, failed?: boolean) => void;
  close: () => Promise<void>;
}

async function mountDepositSurface(): Promise<DepositSurface> {
  vi.stubEnv("NEXT_PUBLIC_SEPOLIA_RPC_URL", "http://127.0.0.1:8545");
  const binding = await createVaultFixture();
  const f = browserWalletFixture();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const token = MIDNIGHT_TOKENS[0];
  if (!token) throw new Error("Expected a supported deposit token");
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
    refresh: vi.fn<ReturnType<typeof useVaultBalances>["refresh"]>().mockResolvedValue(undefined),
  });
  vi.mocked(useMidnightReadiness).mockImplementation(function useFixtureReadiness() {
    return useReadyMidnightFixture(binding.wallet);
  });
  mockMatchingRuntimeServer();
  vi.spyOn(f.publicClient, "getBalance").mockResolvedValue(FUNDED_RESERVE_WEI);
  vi.spyOn(f.publicClient, "estimateGas").mockResolvedValue(21000n);
  vi.spyOn(f.publicClient, "getGasPrice").mockResolvedValue(1n);
  vi.spyOn(f.publicClient, "readContract").mockImplementation(({ functionName }) =>
    Promise.resolve(functionName === "decimals" ? 6 : 2000000n),
  );
  let connection: ReturnType<typeof useEvmWallet> | undefined;
  let localFunding: ReturnType<typeof useEvmLocalFunding> | undefined;
  function Bridge(): null {
    connection = useEvmWallet();
    localFunding = useEvmLocalFunding();
    return null;
  }
  const tree = (): React.JSX.Element => (
    <StrictMode>
      <QueryClientProvider client={client}>
        <RuntimeConfigProvider initialConfiguration={testRuntimeConfiguration()}>
          <LocalFaucetProvider descriptor={LOCAL_FAUCET_DESCRIPTOR_FIXTURE}>
            <EvmWalletProvider>
              <EvmBalancesProvider tokens={[token.erc20Address]}>
                <EvmLocalFundingProvider>
                  <VaultOperationsProvider>
                    <EvmDepositProvider>
                      <Bridge />
                      <EvmDepositTransfer token={token} />
                    </EvmDepositProvider>
                  </VaultOperationsProvider>
                </EvmLocalFundingProvider>
              </EvmBalancesProvider>
            </EvmWalletProvider>
          </LocalFaucetProvider>
        </RuntimeConfigProvider>
      </QueryClientProvider>
    </StrictMode>
  );
  const mounted = render(tree());
  const owner: ReturnType<typeof useEvmWallet> | undefined = connection;
  if (owner === undefined) throw new Error("Expected the mounted EVM connection owner");
  await act(async () => {
    await owner.connect({ key: f.provider, create: () => f.wallet });
  });
  return {
    token,
    funding: (): ReturnType<typeof useEvmLocalFunding> => {
      if (localFunding === undefined) throw new Error("Expected the mounted funding owner");
      return localFunding;
    },
    observe: (depositWei, failed) => {
      vi.mocked(useVaultGasReserves).mockReturnValue(
        vaultGasReservesFixture({ deposit: depositWei, depositFailed: failed }),
      );
      act(() => {
        mounted.rerender(tree());
      });
    },
    close: async () => {
      cleanup();
      client.clear();
      f.wallet.disconnect();
      binding.providers.privateStateProvider.dispose();
      await binding.providers.publicDataProvider.dispose();
      await binding.wallet.disconnect();
    },
  };
}

const sweepBoundaries: { name: string; observed: bigint; blocked: boolean }[] = [
  { name: "zero", observed: 0n, blocked: true },
  {
    name: "one wei below the sweep reserve",
    observed: MPC_OPERATION_ETH_RESERVE.deposit - 1n,
    blocked: true,
  },
  {
    name: "exactly the sweep reserve",
    observed: MPC_OPERATION_ETH_RESERVE.deposit,
    blocked: false,
  },
  {
    name: "above the sweep reserve",
    observed: MPC_OPERATION_ETH_RESERVE.deposit + 1n,
    blocked: false,
  },
];

it.each(sweepBoundaries)(
  "blocks a new deposit transfer at $name: $blocked",
  async ({ observed, blocked }) => {
    const surface = await mountDepositSurface();
    try {
      const amountField = await screen.findByLabelText(
        `Amount to transfer (${surface.token.symbol})`,
      );
      fireEvent.change(amountField, { target: { value: "1" } });
      surface.observe(observed);
      const send = screen.getByRole("button", { name: "Send tokens to deposit address" });
      await waitFor(() => {
        expect(send).toHaveProperty("disabled", blocked);
      });
      expect(send.getAttribute("aria-describedby")).toBe(blocked ? SEND_GATE_ID : null);
      expect(screen.queryByRole("status", { name: SEND_GATE }) !== null).toBe(blocked);
      expect(amountField).toHaveProperty("value", "1");
    } finally {
      await surface.close();
    }
  },
);

const SEND_GATE_ID = "deposit-transfer-send-gate";

it("explains an unreadable deposit reserve and keeps the entered amount", async () => {
  const surface = await mountDepositSurface();
  try {
    const amountField = await screen.findByLabelText(
      `Amount to transfer (${surface.token.symbol})`,
    );
    fireEvent.change(amountField, { target: { value: "0.5" } });
    surface.observe(undefined, true);
    const send = screen.getByRole("button", { name: "Send tokens to deposit address" });
    await waitFor(() => {
      expect(send).toHaveProperty("disabled", true);
    });
    const panel = screen.getByRole("alert", { name: SEND_GATE });
    expect(within(panel).getByText(/could not be read/)).toBeTruthy();
    expect(send.getAttribute("aria-describedby")).toBe(SEND_GATE_ID);
    expect(amountField).toHaveProperty("value", "0.5");
  } finally {
    await surface.close();
  }
});

it("issues one faucet request when both controls for one address are clicked", async () => {
  const surface = await mountDepositSurface();
  const faucet = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("/api/evm/eth-faucet")) throw new Error(`unexpected request ${url}`);
    return Promise.resolve(new Response("{}", { status: 200 }));
  });
  try {
    surface.observe(0n);
    // The gate panel beside the blocked send control and the deposit address section both offer
    // funding for the same account.
    const gateControl = screen
      .getByRole("status", { name: SEND_GATE })
      .querySelector<HTMLButtonElement>("button");
    const sectionControl = screen.getByRole("button", {
      name: "Fund the deposit address with ETH",
    });
    if (!gateControl) throw new Error("Expected the gate funding control");
    expect(gateControl.textContent).toBe("Fund this address with local ETH");
    fireEvent.click(gateControl);
    fireEvent.click(sectionControl);
    await waitFor(() => {
      expect(faucet).toHaveBeenCalledTimes(1);
    });
    const [requested] = faucet.mock.calls[0] ?? [];
    expect(typeof requested === "string" ? requested : "").toContain("/api/evm/eth-faucet");
    await waitFor(() => {
      expect(sectionControl).toHaveProperty("disabled", false);
    });
    expect(faucet).toHaveBeenCalledTimes(1);

    // Past the disabled controls: the owner itself refuses a second request for the account it is
    // already funding, and both callers settle on the same one.
    const owner = surface.funding();
    const address = getAddress("0xD445d8bf69A4E43a5a31f49940AE100c93F9151C");
    let both: Promise<unknown> | undefined;
    act(() => {
      both = Promise.all([owner.fundLocalEthAddress(address), owner.fundLocalEthAddress(address)]);
    });
    await act(async () => {
      await both;
    });
    expect(faucet).toHaveBeenCalledTimes(2);
  } finally {
    faucet.mockRestore();
    await surface.close();
  }
});

it("labels both funding sections without implying that ETH credits a token balance", async () => {
  const surface = await mountDepositSurface();
  try {
    await screen.findByText("Funding addresses");
    expect(screen.getByText("ETH for the deposit sweep.")).toBeTruthy();
    expect(screen.getByText("ETH for swaps and withdrawals.")).toBeTruthy();
    expect(
      screen.getByText(/does not deposit tokens and does not credit any shielded balance/),
    ).toBeTruthy();
    expect(screen.getByText(/not the Midnight vault contract/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Refresh the deposit address balance" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Refresh the EVM vault address balance" }),
    ).toBeTruthy();
  } finally {
    await surface.close();
  }
});

it("rechecks the vault reserve at the operation boundary and leaves the deposit sweep to the deposit flow", async () => {
  const stub = await startRpcStub(CHAIN_ID);
  const binding = await createVaultFixture();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubEnv("NEXT_PUBLIC_SEPOLIA_RPC_URL", stub.url);
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS", binding.environment.contractAddress);
  vi.stubEnv(
    "NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS",
    binding.environment.signetContractAddress,
  );
  vi.stubEnv("NEXT_PUBLIC_MPC_SECP256K1_PUBKEY", binding.environment.mpcSecpPub);
  mockMatchingRuntimeServer();
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
    refresh: vi.fn<ReturnType<typeof useVaultBalances>["refresh"]>().mockResolvedValue(undefined),
  });
  vi.mocked(useMidnightReadiness).mockImplementation(function useFixtureReadiness() {
    return useReadyMidnightFixture(binding.wallet);
  });
  vi.mocked(tokenMetadata.fetchErc20Decimals).mockResolvedValue(6);
  const runSwap = vi
    .mocked(vault.runSwap)
    .mockResolvedValue({ status: "settled", outputUnits: 1n });
  const runDeposit = vi
    .mocked(vault.runDeposit)
    .mockResolvedValue({ status: "settled", outputUnits: null });
  const hook = renderHook(useVaultOperations, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <RuntimeConfigProvider initialConfiguration={testRuntimeConfiguration()}>
          <VaultOperationsProvider>{children}</VaultOperationsProvider>
        </RuntimeConfigProvider>
      </QueryClientProvider>
    ),
  });
  const token = MIDNIGHT_TOKENS[0];
  if (!token) throw new Error("Expected a supported token");
  try {
    await waitFor(() => {
      expect(hook.result.current.ready).toBe(true);
    });
    stub.setBalance(MPC_OPERATION_ETH_RESERVE.swap - 1n);
    await expect(
      hook.result.current.swap(token.erc20Address, token.erc20Address, 1_000_000n),
    ).rejects.toThrow(/below the reserve needed/);
    expect(runSwap).not.toHaveBeenCalled();
    expect(stub.requested).toStrictEqual([binding.vaultAddress.toLowerCase()]);

    stub.failBalance();
    await expect(
      hook.result.current.swap(token.erc20Address, token.erc20Address, 1_000_000n),
    ).rejects.toThrow(/could not be read/);
    expect(runSwap).not.toHaveBeenCalled();

    stub.setBalance(0n);
    await expect(
      hook.result.current.deposit(token.erc20Address, 1_000_000n),
    ).resolves.toStrictEqual({ refunded: false });
    expect(runDeposit).toHaveBeenCalledTimes(1);
  } finally {
    hook.unmount();
    client.clear();
    binding.providers.privateStateProvider.dispose();
    await binding.providers.publicDataProvider.dispose();
    await binding.wallet.disconnect();
    await stub.close();
  }
});
