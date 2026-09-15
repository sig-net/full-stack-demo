import { afterEach, expect, it, vi } from "vitest";

import type { SweepObservation } from "@/lib/evm/sweep-observation";
import type { FlowEvent } from "@/lib/midnight/flow";
import {
  describeSettlementWait,
  type SettlementStage,
  settlementStage,
  type SettlementWait,
} from "@/lib/midnight/settlement-wait";

const MINUTE = 60_000;
const START_OF_RUN = new Date("2026-09-14T09:00:00.000Z");
const REQUEST_ID = "ab".repeat(32);
const EVM_TX_HASH = `0x${"cd".repeat(32)}`;
const MIDNIGHT_TX_HASH = "ef".repeat(32);
const SWEEP_BLOCK = 11701696;

const SIGNATURE_WAIT: FlowEvent = { name: "signature-wait", requestId: REQUEST_ID };
const BROADCAST: FlowEvent = { name: "evm-broadcast", evmTxHash: EVM_TX_HASH };
const RECEIPT: FlowEvent = {
  name: "evm-receipt",
  evmTxHash: EVM_TX_HASH,
  evmBlockNumber: SWEEP_BLOCK,
};
const ATTESTATION_WAIT: FlowEvent = { name: "attestation-wait", requestId: REQUEST_ID };
const ATTESTED: FlowEvent = {
  name: "attestation-present",
  requestId: REQUEST_ID,
  succeeded: true,
};
const SETTLED: FlowEvent = {
  name: "midnight-settled",
  midnightTxHash: MIDNIGHT_TX_HASH,
  midnightBlockHeight: 7335,
};

// Every stage must appear in the mapping table below, so a new member cannot ship uncovered.
const COVERED: Record<SettlementStage, readonly FlowEvent[]> = {
  "mpc-signature": [SIGNATURE_WAIT],
  "sweep-inclusion": [SIGNATURE_WAIT, BROADCAST],
  "mpc-attestation": [SIGNATURE_WAIT, BROADCAST, RECEIPT, ATTESTATION_WAIT],
  "midnight-settlement": [SIGNATURE_WAIT, BROADCAST, RECEIPT, ATTESTATION_WAIT, ATTESTED],
};

/**
 * @param overrides - Fields this case cares about.
 * @returns A complete canonical read of the sweep transaction.
 */
function sweepObservation(overrides: Partial<SweepObservation> = {}): SweepObservation {
  const observedAt = Date.now();
  return {
    evmTxHash: EVM_TX_HASH,
    inclusion: "included",
    blockNumber: SWEEP_BLOCK,
    headBlockNumber: SWEEP_BLOCK,
    confirmations: 1,
    finalizedBlockNumber: null,
    finalized: null,
    finalizedTag: "unsupported",
    observedAt,
    headMovedAt: observedAt,
    ...overrides,
  };
}

/**
 * @param input - Case-specific checkpoints, chain read and read health.
 * @param input.events - Checkpoints published so far.
 * @param input.sweep - Latest successful sweep read.
 * @param input.lastObservedAt - Epoch milliseconds of the last read that returned.
 * @param input.readError - Message of the most recent failed read.
 * @returns The derived waiting reason at the current fake clock reading.
 */
function waitAtNow(input: {
  events: readonly FlowEvent[];
  sweep?: SweepObservation | null;
  lastObservedAt?: number | null;
  readError?: string | null;
}): SettlementWait {
  return describeSettlementWait({
    events: input.events,
    sweep: input.sweep ?? null,
    lastObservedAt: input.lastObservedAt ?? null,
    readError: input.readError ?? null,
    now: Date.now(),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

it("maps every published checkpoint set onto the stage whose evidence is outstanding", () => {
  const stages = Object.keys(COVERED) as SettlementStage[];
  expect(stages.length).toBeGreaterThan(0);
  for (const stage of stages) expect(settlementStage(COVERED[stage])).toBe(stage);
  expect(settlementStage([])).toBeNull();
  expect(settlementStage([{ name: "request-confirmed", requestId: REQUEST_ID }])).toBeNull();
  expect(settlementStage([...COVERED["midnight-settlement"], SETTLED])).toBeNull();
});

it("names the sweep as not yet in a block while the broadcast has no receipt", () => {
  vi.useFakeTimers();
  vi.setSystemTime(START_OF_RUN);
  const wait = waitAtNow({
    events: [SIGNATURE_WAIT, BROADCAST],
    sweep: sweepObservation({ inclusion: "pending", blockNumber: null, confirmations: null }),
    lastObservedAt: Date.now(),
  });
  expect(wait.stage).toBe("sweep-inclusion");
  expect(wait.headline).toBe("Waiting for the sweep transaction to enter a block.");
  expect(wait.details).toContain(
    "The sweep transaction is on the network and has not entered a block yet.",
  );
  expect(wait.finalAwaitingAttestation).toBe(false);
});

it("reports depth alone on an endpoint that does not serve the finalized tag", () => {
  vi.useFakeTimers();
  vi.setSystemTime(START_OF_RUN);
  const wait = waitAtNow({
    events: COVERED["mpc-attestation"],
    sweep: sweepObservation({ headBlockNumber: SWEEP_BLOCK + 2, confirmations: 3 }),
    lastObservedAt: Date.now(),
  });
  expect(wait.stage).toBe("mpc-attestation");
  expect(wait.details).toContain(
    `Included in block ${SWEEP_BLOCK.toString()}, now 3 confirmations deep.`,
  );
  expect(wait.details).toContain(
    "This endpoint does not report a finalized block, so confirmation depth is the only chain progress it can show.",
  );
  expect(wait.finalAwaitingAttestation).toBe(false);
  expect(wait.details.join(" ")).not.toContain("finalized head");
});

it("reports finality lag and then a final sweep whose attestation is still absent", () => {
  vi.useFakeTimers();
  vi.setSystemTime(START_OF_RUN);
  const lagging = waitAtNow({
    events: COVERED["mpc-attestation"],
    sweep: sweepObservation({
      finalizedTag: "supported",
      finalizedBlockNumber: SWEEP_BLOCK - 64,
      finalized: false,
    }),
    lastObservedAt: Date.now(),
  });
  expect(lagging.finalAwaitingAttestation).toBe(false);
  expect(lagging.details).toContain(
    `The finalized head is at block ${(SWEEP_BLOCK - 64).toString()} and has not reached this block.`,
  );

  const covered = waitAtNow({
    events: COVERED["mpc-attestation"],
    sweep: sweepObservation({
      finalizedTag: "supported",
      finalizedBlockNumber: SWEEP_BLOCK + 3,
      finalized: true,
    }),
    lastObservedAt: Date.now(),
  });
  expect(covered.stage).toBe("mpc-attestation");
  expect(covered.finalAwaitingAttestation).toBe(true);
  expect(covered.details).toContain(
    "The sweep transaction is final on chain. The MPC attestation of its outcome is still absent, and the shielded balance is credited only once that attestation verifies.",
  );
});

it("withholds every finality claim while the receipt block is not canonical", () => {
  vi.useFakeTimers();
  vi.setSystemTime(START_OF_RUN);
  const wait = waitAtNow({
    events: COVERED["mpc-attestation"],
    sweep: sweepObservation({
      inclusion: "reorged",
      confirmations: null,
      finalizedTag: "supported",
      finalizedBlockNumber: SWEEP_BLOCK + 10,
      finalized: null,
    }),
    lastObservedAt: Date.now(),
  });
  expect(wait.finalAwaitingAttestation).toBe(false);
  expect(wait.details).toContain(
    "The sweep transaction is not in the canonical chain at the block that held it. Its inclusion is rechecked on every poll.",
  );
  expect(wait.details.join(" ")).not.toContain("confirmations deep");
  expect(wait.details.join(" ")).not.toContain("covers this block");
});

it("stops observing the sweep once the attestation is verified and drops the wait once settled", () => {
  vi.useFakeTimers();
  vi.setSystemTime(START_OF_RUN);
  const settling = waitAtNow({
    events: COVERED["midnight-settlement"],
    sweep: sweepObservation(),
    lastObservedAt: Date.now(),
  });
  expect(settling.stage).toBe("midnight-settlement");
  expect(settling.headline).toBe("Completing this operation on Midnight.");
  expect(settling.details.join(" ")).not.toContain("Included in block");

  const done = waitAtNow({ events: [...COVERED["midnight-settlement"], SETTLED] });
  expect(done.stage).toBeNull();
  expect(done.headline).toBeNull();
  expect(done.details).toEqual([]);
});

it("reports read staleness and a failed read without ending the wait", () => {
  vi.useFakeTimers();
  vi.setSystemTime(START_OF_RUN);
  const readAt = Date.now();
  const fresh = waitAtNow({
    events: COVERED["mpc-attestation"],
    sweep: sweepObservation(),
    lastObservedAt: readAt,
  });
  expect(fresh.stale).toBe(false);
  expect(fresh.observationLagMs).toBe(0);

  vi.advanceTimersByTime(45_000);
  const stale = waitAtNow({
    events: COVERED["mpc-attestation"],
    sweep: sweepObservation(),
    lastObservedAt: readAt,
    readError: "endpoint unavailable",
  });
  expect(stale.stale).toBe(true);
  expect(stale.stage).toBe("mpc-attestation");
  expect(stale.details).toContain("Last successful chain read 45s ago.");
  expect(stale.details).toContain(
    "The last chain read failed: endpoint unavailable. Reads continue.",
  );
});

it("keeps naming the outstanding attestation across waits beyond six and fifteen minutes", () => {
  vi.useFakeTimers();
  vi.setSystemTime(START_OF_RUN);
  const enteredAt = Date.now();
  const sweep = sweepObservation({
    finalizedTag: "supported",
    finalizedBlockNumber: SWEEP_BLOCK + 1,
    finalized: true,
  });

  vi.advanceTimersByTime(6 * MINUTE);
  const afterSix = waitAtNow({
    events: COVERED["mpc-attestation"],
    sweep,
    lastObservedAt: Date.now(),
  });
  expect(Date.now() - enteredAt).toBe(6 * MINUTE);
  expect(afterSix.stage).toBe("mpc-attestation");
  expect(afterSix.finalAwaitingAttestation).toBe(true);
  expect(afterSix.stale).toBe(false);
  expect(afterSix.details).toContain(
    `The chain head has stayed at block ${SWEEP_BLOCK.toString()} for 6m 00s.`,
  );

  vi.advanceTimersByTime(9 * MINUTE + 30_000);
  const afterFifteen = waitAtNow({
    events: COVERED["mpc-attestation"],
    sweep,
    lastObservedAt: Date.now(),
  });
  expect(Date.now() - enteredAt).toBe(15 * MINUTE + 30_000);
  expect(afterFifteen.stage).toBe("mpc-attestation");
  expect(afterFifteen.finalAwaitingAttestation).toBe(true);
  expect(afterFifteen.details).toContain(
    `The chain head has stayed at block ${SWEEP_BLOCK.toString()} for 15m 30s.`,
  );
  expect(afterFifteen.details.join(" ")).not.toMatch(/minutes? left|expected|estimate|%/);
});
