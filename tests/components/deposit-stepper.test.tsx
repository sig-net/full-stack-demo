import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { DepositStepper } from "@/components/deposit-dialog/deposit-stepper";
import { MIDNIGHT_TOKENS, type TokenConfig } from "@/lib/constants/token-metadata";
import {
  DEPOSIT_STEP_LABEL,
  type DepositStepId,
  type DepositStepStatus,
} from "@/lib/midnight/deposit-steps";
import type { FlowEvent } from "@/lib/midnight/flow";
import { RuntimeConfigProvider } from "@/providers/runtime-config-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

import {
  mockMatchingRuntimeServer,
  testRuntimeConfiguration,
} from "../config/runtime-server-fixture";
import { createVaultFixture } from "../sdk/vault-fixture";
import { progressState } from "./midnight-progress-fixture";

vi.mock(import("@/hooks/use-midnight-progress"), { spy: true });
vi.mock(import("@/hooks/use-settlement-wait"), { spy: true });
vi.mock(import("@/providers/vault-context"), { spy: true });
vi.mock(import("@/providers/vault-operations-context"), { spy: true });

const { useMidnightProgress } = await import("@/hooks/use-midnight-progress");
const { useSettlementWait } = await import("@/hooks/use-settlement-wait");

const REQUEST_ID = "ab".repeat(32);
const SWEEP_HASH = `0x${"cd".repeat(32)}`;
const MIDNIGHT_HASH = "ef".repeat(32);

const IDLE_WAIT = {
  stage: null,
  headline: null,
  details: [],
  sweep: null,
  observationLagMs: null,
  stale: false,
  readError: null,
  finalAwaitingAttestation: false,
} as const;

// The published checkpoints of one complete deposit, in the order the protocol reaches them.
const CHECKPOINTS: Record<string, FlowEvent> = {
  submitted: { name: "request-submitted", predictedRequestId: REQUEST_ID },
  confirmed: { name: "request-confirmed", requestId: REQUEST_ID },
  signatureWait: { name: "signature-wait", requestId: REQUEST_ID },
  broadcast: { name: "evm-broadcast", evmTxHash: SWEEP_HASH },
  receipt: { name: "evm-receipt", evmTxHash: SWEEP_HASH, evmBlockNumber: 11701696 },
  attestationWait: { name: "attestation-wait", requestId: REQUEST_ID },
  attested: { name: "attestation-present", requestId: REQUEST_ID, succeeded: true },
  attestationFailed: { name: "attestation-present", requestId: REQUEST_ID, succeeded: false },
  settled: { name: "midnight-settled", midnightTxHash: MIDNIGHT_HASH, midnightBlockHeight: 7335 },
};

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(useSettlementWait).mockReturnValue(IDLE_WAIT);
  vi.mocked(useMidnightProgress).mockReturnValue(progressState());
});

interface StepperInput {
  events?: readonly FlowEvent[];
  active?: boolean;
  error?: string | null;
  requestId?: string | null;
  status?: "pending" | "failed" | "completed";
  currentToken?: string | null;
  kind?: "deposit" | "swap";
  waitHeadline?: string | null;
  stageElapsedMs?: number | null;
}

async function mountStepper(input: StepperInput = {}): Promise<{
  token: TokenConfig;
  recover: ReturnType<typeof vi.fn<ReturnType<typeof useVaultOperations>["recoverDeposit"]>>;
  close: () => Promise<void>;
}> {
  const binding = await createVaultFixture();
  const token = MIDNIGHT_TOKENS[0];
  if (!token) throw new Error("Expected a supported token");
  const recover = vi
    .fn<ReturnType<typeof useVaultOperations>["recoverDeposit"]>()
    .mockResolvedValue({ refunded: false });
  const requestId = input.requestId === undefined ? null : input.requestId;
  const currentToken = input.currentToken === undefined ? token.erc20Address : input.currentToken;
  vi.mocked(useVaultOperations).mockReturnValue({
    currentDeposit:
      currentToken === null
        ? null
        : { token: currentToken, requestId, status: input.status ?? "pending" },
    log: [],
    busy: input.active ?? false,
    ready: true,
    unavailable: null,
    lookupDepositRequest: vi.fn(),
    recoverDeposit: recover,
    deposit: vi.fn(),
    withdraw: vi.fn(),
    swap: vi.fn(),
    supply: vi.fn(),
    redeem: vi.fn(),
  });
  vi.mocked(useVault).mockReturnValue({
    status: "ready",
    error: null,
    binding,
    requireBinding: () => binding,
    retry: vi.fn(),
    rebuild: vi.fn(),
    disconnect: vi.fn(),
  });
  vi.mocked(useMidnightProgress).mockReturnValue(
    progressState({
      kind: input.kind ?? "deposit",
      active: input.active ?? false,
      error: input.error ?? null,
      events: input.events ?? [],
      message: "Generating proof (runs locally, can take minutes)…",
      stageElapsedMs: input.stageElapsedMs ?? null,
    }),
  );
  if (input.waitHeadline != null)
    vi.mocked(useSettlementWait).mockReturnValue({ ...IDLE_WAIT, headline: input.waitHeadline });
  mockMatchingRuntimeServer();
  const query = new QueryClient();
  const view = render(<DepositStepper token={token} />, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={query}>
        <RuntimeConfigProvider initialConfiguration={testRuntimeConfiguration()}>
          {children}
        </RuntimeConfigProvider>
      </QueryClientProvider>
    ),
  });
  return {
    token,
    recover,
    close: async () => {
      view.unmount();
      query.clear();
      binding.providers.privateStateProvider.dispose();
      await binding.providers.publicDataProvider.dispose();
    },
  };
}

function stepStatus(id: DepositStepId): string {
  const list = screen.getByRole("list");
  const item = within(list).getByText(new RegExp(DEPOSIT_STEP_LABEL[id])).closest("li");
  if (!item) throw new Error(`Step ${id} is not rendered`);
  return item.textContent ?? "";
}

function announcement(): string {
  return screen.getByRole("status", { name: "Deposit progress" }).textContent ?? "";
}

const STATUS_WORDS: Record<DepositStepStatus, string> = {
  pending: "Not started",
  active: "In progress",
  complete: "Completed",
  attention: "Needs attention",
};

const STEP_INVENTORY: readonly DepositStepId[] = [
  "request",
  "signature",
  "sweep",
  "attestation",
  "settlement",
];

it("renders all five contract steps as pending before any deposit starts", async () => {
  expect(STEP_INVENTORY.length).toBeGreaterThan(0);
  const mounted = await mountStepper({ currentToken: null });
  try {
    const items = screen.getAllByRole("listitem");
    expect(items.length).toBe(STEP_INVENTORY.length);
    for (const id of STEP_INVENTORY) {
      expect(stepStatus(id)).toContain(DEPOSIT_STEP_LABEL[id]);
      expect(stepStatus(id)).toContain(STATUS_WORDS.pending);
    }
    expect(announcement()).toContain("Step 1 of 5: Create deposit request on Midnight");
  } finally {
    await mounted.close();
  }
});

const PROGRESSION: readonly {
  name: string;
  events: readonly (keyof typeof CHECKPOINTS)[];
  complete: readonly DepositStepId[];
  current: DepositStepId | null;
}[] = [
  { name: "proving", events: [], complete: [], current: "request" },
  { name: "submitted", events: ["submitted"], complete: [], current: "request" },
  {
    name: "confirmed",
    events: ["submitted", "confirmed"],
    complete: ["request"],
    current: "signature",
  },
  {
    name: "awaiting the signature",
    events: ["submitted", "confirmed", "signatureWait"],
    complete: ["request"],
    current: "signature",
  },
  {
    name: "broadcast",
    events: ["submitted", "confirmed", "signatureWait", "broadcast"],
    complete: ["request", "signature"],
    current: "sweep",
  },
  {
    name: "mined",
    events: ["submitted", "confirmed", "signatureWait", "broadcast", "receipt"],
    complete: ["request", "signature", "sweep"],
    current: "attestation",
  },
  {
    name: "attested",
    events: ["submitted", "confirmed", "signatureWait", "broadcast", "receipt", "attested"],
    complete: ["request", "signature", "sweep", "attestation"],
    current: "settlement",
  },
  {
    name: "settled",
    events: [
      "submitted",
      "confirmed",
      "signatureWait",
      "broadcast",
      "receipt",
      "attested",
      "settled",
    ],
    complete: ["request", "signature", "sweep", "attestation", "settlement"],
    current: null,
  },
];

it.each(PROGRESSION)(
  "ticks only the steps proven at the $name checkpoint",
  async ({ events, complete, current }) => {
    const mounted = await mountStepper({
      active: current !== null,
      events: events.map((key) => {
        const event = CHECKPOINTS[key];
        if (!event) throw new Error(`Unknown checkpoint ${key}`);
        return event;
      }),
    });
    try {
      for (const id of STEP_INVENTORY) {
        const expected = complete.includes(id)
          ? STATUS_WORDS.complete
          : id === current
            ? STATUS_WORDS.active
            : STATUS_WORDS.pending;
        expect(stepStatus(id)).toContain(expected);
      }
      expect(announcement()).toContain(
        current === null ? "All five steps are finished" : DEPOSIT_STEP_LABEL[current],
      );
    } finally {
      await mounted.close();
    }
  },
);

it("treats a recovered deposit with no submitted checkpoint as step 1 completed earlier", async () => {
  const mounted = await mountStepper({
    active: true,
    requestId: REQUEST_ID,
    events: [CHECKPOINTS.confirmed, CHECKPOINTS.signatureWait].filter(
      (event): event is FlowEvent => event !== undefined,
    ),
    waitHeadline: "Waiting for the MPC signature for this request.",
  });
  try {
    expect(stepStatus("request")).toContain(STATUS_WORDS.complete);
    expect(stepStatus("signature")).toContain(STATUS_WORDS.active);
    expect(stepStatus("signature")).toContain("Waiting for the MPC signature for this request.");
  } finally {
    await mounted.close();
  }
});

it("never ticks an attestation the MPC reported as failed", async () => {
  const attested = CHECKPOINTS.attestationFailed;
  const confirmed = CHECKPOINTS.confirmed;
  const receipt = CHECKPOINTS.receipt;
  const broadcast = CHECKPOINTS.broadcast;
  if (!attested || !confirmed || !receipt || !broadcast) throw new Error("Missing checkpoint");
  const mounted = await mountStepper({
    requestId: REQUEST_ID,
    events: [confirmed, broadcast, receipt, attested],
  });
  try {
    expect(stepStatus("sweep")).toContain(STATUS_WORDS.complete);
    expect(stepStatus("attestation")).toContain(STATUS_WORDS.attention);
    expect(stepStatus("attestation")).toContain("attested this sweep as failed");
    expect(stepStatus("settlement")).toContain(STATUS_WORDS.pending);
  } finally {
    await mounted.close();
  }
});

it("keeps the failing step in place with earlier evidence and offers recovery beside it", async () => {
  const confirmed = CHECKPOINTS.confirmed;
  const broadcast = CHECKPOINTS.broadcast;
  if (!confirmed || !broadcast) throw new Error("Missing checkpoint");
  const mounted = await mountStepper({
    requestId: REQUEST_ID,
    error: "sweep 0xcdcd not confirmed",
    events: [confirmed, broadcast],
  });
  try {
    expect(stepStatus("request")).toContain(STATUS_WORDS.complete);
    expect(stepStatus("signature")).toContain(STATUS_WORDS.complete);
    expect(stepStatus("sweep")).toContain(STATUS_WORDS.attention);
    const alert = screen.getByRole("alert", { name: "Step 3" });
    expect(alert.textContent).toContain("sweep 0xcdcd not confirmed");
    expect(alert.textContent).toContain("reuses its request and its signed sweep");
    fireEvent.click(within(alert).getByRole("button", { name: "Recover this deposit" }));
    await waitFor(() => {
      expect(mounted.recover).toHaveBeenCalledWith(mounted.token.erc20Address, REQUEST_ID);
    });
  } finally {
    await mounted.close();
  }
});

it("offers no recovery for a settled deposit and marks every step complete", async () => {
  const mounted = await mountStepper({ requestId: REQUEST_ID, status: "completed" });
  try {
    for (const id of STEP_INVENTORY) expect(stepStatus(id)).toContain(STATUS_WORDS.complete);
    expect(screen.queryByRole("button", { name: "Recover this deposit" })).toBeNull();
  } finally {
    await mounted.close();
  }
});

it("maps no checkpoint onto the deposit steps while another operation owns the progress", async () => {
  const settled = CHECKPOINTS.settled;
  if (!settled) throw new Error("Missing checkpoint");
  const mounted = await mountStepper({
    kind: "swap",
    active: true,
    currentToken: null,
    events: [settled],
  });
  try {
    for (const id of STEP_INVENTORY) expect(stepStatus(id)).toContain(STATUS_WORDS.pending);
  } finally {
    await mounted.close();
  }
});

it("shows the elapsed reading of the active step only", async () => {
  const confirmed = CHECKPOINTS.confirmed;
  const signatureWait = CHECKPOINTS.signatureWait;
  if (!confirmed || !signatureWait) throw new Error("Missing checkpoint");
  const mounted = await mountStepper({
    active: true,
    requestId: REQUEST_ID,
    events: [confirmed, signatureWait],
    stageElapsedMs: 930_000,
  });
  try {
    expect(stepStatus("signature")).toContain("In this step for 15m 30s.");
    expect(stepStatus("sweep")).not.toContain("In this step for");
  } finally {
    await mounted.close();
  }
});

it("asks for a confirmed request ID to be saved while the deposit can still need it", async () => {
  const writeText = vi.fn<(value: string) => Promise<void>>().mockResolvedValue();
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { readText: vi.fn(), writeText },
  });
  const absent = await mountStepper({ active: true });
  const warning = (): HTMLElement =>
    screen.getByRole("status", { name: "Deposit request ID safekeeping" });
  try {
    expect(screen.queryByRole("status", { name: "Deposit request ID safekeeping" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy request ID" })).toBeNull();
  } finally {
    await absent.close();
  }

  const pending = await mountStepper({ active: true, requestId: REQUEST_ID });
  try {
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
      expect(writeText).toHaveBeenCalledWith(REQUEST_ID);
    });
    await waitFor(() => {
      expect(warning().textContent).toContain("Copied to the clipboard.");
    });
    expect(warning().textContent).toContain("Store it somewhere that survives closing this page.");
    writeText.mockRejectedValueOnce(new Error("Clipboard write refused"));
    fireEvent.click(screen.getByRole("button", { name: "Copy request ID" }));
    await screen.findByText("Clipboard write refused");
    expect(warning().textContent).not.toContain("Copied to the clipboard.");
    expect(warning().textContent).toContain("Save this deposit request ID.");
  } finally {
    await pending.close();
  }

  const failed = await mountStepper({ requestId: REQUEST_ID, status: "failed", error: "node" });
  try {
    expect(warning().textContent).toContain("Save this deposit request ID.");
  } finally {
    await failed.close();
  }

  const completed = await mountStepper({ requestId: REQUEST_ID, status: "completed" });
  try {
    expect(warning().textContent).toContain("Deposit completed. Keep this request ID");
    expect(warning().textContent).not.toContain("Save this deposit request ID.");
    expect(screen.getByRole("button", { name: "Copy request ID" })).toHaveProperty(
      "disabled",
      false,
    );
  } finally {
    await completed.close();
  }
});
