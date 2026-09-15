import type { SweepObservation } from "@/lib/evm/sweep-observation";
import { formatElapsed } from "@/lib/utils/date-formatting";

import type { FlowEvent } from "./flow";

// Observation thresholds owned by this surface. They describe how fresh the displayed readings
// are and carry no claim about the chain's own block time or about any protocol deadline.
const STALLED_HEAD_MS = 60_000;
const STALE_READ_MS = 30_000;

/** The thing an operation is waiting for, named after the evidence that has not arrived. */
export type SettlementStage =
  "mpc-signature" | "sweep-inclusion" | "mpc-attestation" | "midnight-settlement";

/** Waiting reason of a running operation, with the chain evidence that produced it. */
export interface SettlementWait {
  readonly stage: SettlementStage | null;
  /** Names what has not arrived, or null while nothing waits on the MPC or the chain. */
  readonly headline: string | null;
  /** Observed chain evidence behind the wait, in reading order. */
  readonly details: readonly string[];
  /** The transaction under observation, or null before a sweep is on the network. */
  readonly sweep: SweepObservation | null;
  /** Milliseconds since the last chain read that returned, or null while none has. */
  readonly observationLagMs: number | null;
  /** Whether the last successful read is older than this surface's freshness threshold. */
  readonly stale: boolean;
  /** Message of the most recent failed read, cleared by the next successful one. */
  readonly readError: string | null;
  /** Whether the sweep is proven final on chain while the MPC attestation is absent. */
  readonly finalAwaitingAttestation: boolean;
}

const HEADLINE: Record<SettlementStage, string> = {
  "mpc-signature": "Waiting for the MPC signature for this request.",
  "sweep-inclusion": "Waiting for the sweep transaction to enter a block.",
  "mpc-attestation": "Waiting for the MPC attestation of the sweep outcome.",
  "midnight-settlement": "Completing this operation on Midnight.",
};

/**
 * @param events - Checkpoints published so far by the running operation.
 * @returns The stage whose evidence is outstanding, or null once nothing is awaited.
 */
export function settlementStage(events: readonly FlowEvent[]): SettlementStage | null {
  const names = new Set(events.map((event) => event.name));
  if (names.has("midnight-settled")) return null;
  if (names.has("attestation-present")) return "midnight-settlement";
  if (names.has("evm-receipt") || names.has("attestation-wait")) return "mpc-attestation";
  if (names.has("evm-broadcast")) return "sweep-inclusion";
  if (names.has("signature-wait")) return "mpc-signature";
  return null;
}

/**
 * @param events - Checkpoints published so far by the running operation.
 * @returns The sweep transaction hash once one is on the network, otherwise null.
 */
export function sweepTxHash(events: readonly FlowEvent[]): string | null {
  for (const event of events)
    if (event.name === "evm-broadcast" || event.name === "evm-receipt") return event.evmTxHash;
  return null;
}

/**
 * @param events - Checkpoints published so far by the running operation.
 * @returns Whether a receipt for the sweep has already been observed and published.
 */
export function sweepReceiptObserved(events: readonly FlowEvent[]): boolean {
  return events.some((event) => event.name === "evm-receipt");
}

/**
 * @param sweep - Latest successful read of the sweep transaction.
 * @param now - Current epoch milliseconds.
 * @returns Inclusion, depth, finality and head lines for the observed transaction.
 */
function describeSweep(sweep: SweepObservation, now: number): string[] {
  const lines: string[] = [];
  if (sweep.inclusion === "pending")
    lines.push("The sweep transaction is on the network and has not entered a block yet.");
  else if (sweep.inclusion === "reorged")
    lines.push(
      "The sweep transaction is not in the canonical chain at the block that held it. Its inclusion is rechecked on every poll.",
    );
  else if (sweep.blockNumber !== null && sweep.confirmations !== null)
    lines.push(
      `Included in block ${sweep.blockNumber.toString()}, now ${sweep.confirmations.toString()} ${
        sweep.confirmations === 1 ? "confirmation" : "confirmations"
      } deep.`,
    );

  if (sweep.finalizedTag === "unsupported")
    lines.push(
      "This endpoint does not report a finalized block, so confirmation depth is the only chain progress it can show.",
    );
  else if (sweep.finalizedBlockNumber !== null && sweep.finalized !== null)
    lines.push(
      sweep.finalized
        ? `The finalized head is at block ${sweep.finalizedBlockNumber.toString()} and covers this block.`
        : `The finalized head is at block ${sweep.finalizedBlockNumber.toString()} and has not reached this block.`,
    );

  const headStalledFor = now - sweep.headMovedAt;
  lines.push(
    headStalledFor >= STALLED_HEAD_MS
      ? `The chain head has stayed at block ${sweep.headBlockNumber.toString()} for ${formatElapsed(headStalledFor)}.`
      : `Chain head at block ${sweep.headBlockNumber.toString()}.`,
  );
  return lines;
}

/**
 * Derives the waiting reason of a running operation from its checkpoints and its chain reads.
 *
 * Chain finality is reported as observed progress only. The shielded balance is credited from the
 * verified MPC attestation, so a final sweep with no attestation is reported as an outstanding
 * attestation.
 *
 * @param input - Published checkpoints, the latest chain read and this surface's read health.
 * @param input.events - Checkpoints published so far by the running operation.
 * @param input.sweep - Latest successful sweep read, or null while none has returned.
 * @param input.lastObservedAt - Epoch milliseconds of the last chain read that returned.
 * @param input.readError - Message of the most recent failed read, cleared by a successful one.
 * @param input.now - Current epoch milliseconds.
 * @returns The stage, its headline, the observed evidence and this surface's read health.
 */
export function describeSettlementWait(input: {
  events: readonly FlowEvent[];
  sweep: SweepObservation | null;
  lastObservedAt: number | null;
  readError: string | null;
  now: number;
}): SettlementWait {
  const { events, sweep, lastObservedAt, readError, now } = input;
  const stage = settlementStage(events);
  const observationLagMs = lastObservedAt === null ? null : Math.max(0, now - lastObservedAt);
  const stale = observationLagMs !== null && observationLagMs >= STALE_READ_MS;
  const finalAwaitingAttestation = stage === "mpc-attestation" && sweep?.finalized === true;

  const details: string[] = [];
  if (stage !== null && stage !== "midnight-settlement" && sweep !== null)
    details.push(...describeSweep(sweep, now));
  if (finalAwaitingAttestation)
    details.push(
      "The sweep transaction is final on chain. The MPC attestation of its outcome is still absent, and the shielded balance is credited only once that attestation verifies.",
    );
  if (observationLagMs !== null)
    details.push(`Last successful chain read ${formatElapsed(observationLagMs)} ago.`);
  if (readError !== null) details.push(`The last chain read failed: ${readError}. Reads continue.`);

  return {
    stage,
    headline: stage === null ? null : HEADLINE[stage],
    details,
    sweep,
    observationLagMs,
    stale,
    readError,
    finalAwaitingAttestation,
  };
}
