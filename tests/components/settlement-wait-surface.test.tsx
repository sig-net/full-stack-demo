import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { StrictMode } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { SettlementWaitDetail } from "@/components/settlement-wait-detail";
import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import type { FlowEvent, FlowKind } from "@/lib/midnight/flow";
import type { VaultBinding } from "@/lib/midnight/vault-session";
import { ConfigurationProvider } from "@/providers/configuration-context";
import { useVault } from "@/providers/vault-context";

import { testRuntimeConfiguration } from "../config/runtime-server-fixture";
import { type RpcStub, startRpcStub, stubBlockHash } from "../evm/rpc-stub";
import { createVaultFixture } from "../sdk/vault-fixture";
import { progressState } from "./midnight-progress-fixture";

vi.mock(import("@/hooks/use-midnight-progress"), { spy: true });
vi.mock(import("@/providers/vault-context"), { spy: true });

const CHAIN_ID = 11155111n;
const REQUEST_ID = "ab".repeat(32);
const EVM_TX_HASH = `0x${"cd".repeat(32)}`;
const SWEEP_BLOCK = 11701696;

const ATTESTATION_WAIT_EVENTS: readonly FlowEvent[] = [
  { name: "request-confirmed", requestId: REQUEST_ID },
  { name: "signature-wait", requestId: REQUEST_ID },
  { name: "evm-broadcast", evmTxHash: EVM_TX_HASH },
  { name: "evm-receipt", evmTxHash: EVM_TX_HASH, evmBlockNumber: SWEEP_BLOCK },
  { name: "attestation-wait", requestId: REQUEST_ID },
];

let stub: RpcStub;
let binding: VaultBinding;

beforeAll(async () => {
  stub = await startRpcStub(CHAIN_ID);
  const fixture = await createVaultFixture();
  binding = { ...fixture, environment: { ...fixture.environment, evmRpcUrl: stub.url } };
});

afterAll(async () => {
  await stub.close();
  binding.providers.privateStateProvider.dispose();
  await binding.providers.publicDataProvider.dispose();
  await binding.wallet.disconnect();
});

beforeEach(() => {
  stub.resumeReads();
  stub.setHead(SWEEP_BLOCK);
  stub.setReceipt({ blockNumber: SWEEP_BLOCK, blockHash: stubBlockHash(SWEEP_BLOCK) });
  stub.setBlockHash(SWEEP_BLOCK, stubBlockHash(SWEEP_BLOCK));
  stub.setFinalizedTag({ kind: "rejected" });
  vi.mocked(useVault).mockReturnValue({
    status: "ready",
    error: null,
    binding,
    requireBinding: () => binding,
    retry: vi.fn(),
    rebuild: vi.fn(),
    disconnect: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
});

/**
 * @param events - Checkpoints the shared progress owner has published.
 * @param kind - Operation category owning the shared progress.
 * @returns The mounted surface and its query owner.
 */
function mountWait(
  events: readonly FlowEvent[],
  kind: FlowKind | null = null,
): { client: QueryClient } {
  vi.mocked(useMidnightProgress).mockReturnValue(
    progressState({ active: true, kind, message: "MPC signing + settling on Sepolia…", events }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
    <StrictMode>
      <QueryClientProvider client={client}>
        <ConfigurationProvider initialConfiguration={testRuntimeConfiguration()}>
          {children}
        </ConfigurationProvider>
      </QueryClientProvider>
    </StrictMode>
  );
  render(<SettlementWaitDetail />, { wrapper });
  return { client };
}

it("renders the outstanding attestation with the sweep depth this endpoint can show", async () => {
  const { client } = mountWait(ATTESTATION_WAIT_EVENTS);
  try {
    expect(screen.getByText("Waiting for the MPC attestation of the sweep outcome.")).toBeDefined();
    await waitFor(() => {
      expect(
        screen.getByText(`Included in block ${SWEEP_BLOCK.toString()}, now 1 confirmation deep.`),
      ).toBeDefined();
    });
    expect(screen.getByRole("button", { name: "Copy Sweep transaction hash" })).toBeDefined();
    expect(
      screen.getByText(
        "This endpoint does not report a finalized block, so confirmation depth is the only chain progress it can show.",
      ),
    ).toBeDefined();
  } finally {
    client.clear();
  }
});

it("says the sweep is final while the MPC attestation is still absent", async () => {
  stub.setHead(SWEEP_BLOCK + 70);
  stub.setFinalizedTag({ kind: "height", height: SWEEP_BLOCK + 6 });
  const { client } = mountWait(ATTESTATION_WAIT_EVENTS);
  try {
    await waitFor(() => {
      expect(
        screen.getByText(
          `The finalized head is at block ${(SWEEP_BLOCK + 6).toString()} and covers this block.`,
        ),
      ).toBeDefined();
    });
    expect(
      screen.getByText(
        "The sweep transaction is final on chain. The MPC attestation of its outcome is still absent, and the shielded balance is credited only once that attestation verifies.",
      ),
    ).toBeDefined();
    expect(screen.getByText("Waiting for the MPC attestation of the sweep outcome.")).toBeDefined();
  } finally {
    client.clear();
  }
});

it("reports a failing endpoint as a failed read and keeps naming the wait", async () => {
  stub.failReads();
  const { client } = mountWait(ATTESTATION_WAIT_EVENTS);
  try {
    await waitFor(
      () => {
        expect(screen.getByText(/The last chain read failed:/)).toBeDefined();
      },
      { timeout: 8000 },
    );
    expect(screen.getByText("Waiting for the MPC attestation of the sweep outcome.")).toBeDefined();
    expect(screen.queryByText(/confirmation deep/)).toBeNull();
  } finally {
    client.clear();
  }
});

it("renders nothing once every checkpoint's evidence has arrived", () => {
  const { client } = mountWait([
    ...ATTESTATION_WAIT_EVENTS,
    { name: "attestation-present", requestId: REQUEST_ID, succeeded: true },
    { name: "midnight-settled", midnightTxHash: "ef".repeat(32), midnightBlockHeight: 7335 },
  ]);
  try {
    expect(screen.queryByRole("button", { name: "Copy Sweep transaction hash" })).toBeNull();
    expect(screen.queryByText(/Waiting for/)).toBeNull();
  } finally {
    client.clear();
  }
});

// Every operation shares the MPC settlement path, so this surface names whichever one is waiting.
const OPERATION_NAMES: Record<FlowKind, string> = {
  deposit: "Deposit",
  withdraw: "Withdrawal",
  swap: "Swap",
  supply: "Supply",
  redeem: "Redeem",
};

it("names the waiting operation for every operation that shares the settlement path", () => {
  const kinds = Object.keys(OPERATION_NAMES) as FlowKind[];
  expect(kinds.length).toBeGreaterThan(0);
  for (const kind of kinds) {
    const { client } = mountWait(ATTESTATION_WAIT_EVENTS, kind);
    try {
      expect(
        screen.getByText(
          `${OPERATION_NAMES[kind]}: Waiting for the MPC attestation of the sweep outcome.`,
        ),
      ).toBeDefined();
    } finally {
      cleanup();
      client.clear();
    }
  }
});
