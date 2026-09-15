import type { FlowEvent } from "./flow";

/** The five user-facing stages of one deposit, in the order the protocol reaches them. */
export type DepositStepId = "request" | "signature" | "sweep" | "attestation" | "settlement";

/** Presentation state of one step, paired with a textual status so colour is never the only cue. */
export type DepositStepStatus = "pending" | "active" | "complete" | "attention";

/** One rendered step: its identity, label, state and the line describing that state. */
export interface DepositStepView {
  readonly id: DepositStepId;
  /** Position in the fixed sequence, from 1 to `DEPOSIT_STEP_COUNT`. */
  readonly position: number;
  readonly label: string;
  readonly status: DepositStepStatus;
  /** Status as words, so every user reads the state and colour is never the only cue. */
  readonly statusLabel: string;
  /** Active detail or completion evidence, or null for a step nothing is known about yet. */
  readonly detail: string | null;
}

/** The whole five-step view, with the step holding current-step semantics. */
export interface DepositStepsView {
  readonly steps: readonly DepositStepView[];
  /** Earliest incomplete step, or null once every step's evidence is in hand. */
  readonly current: DepositStepId | null;
  /** Restrained live-region text, which changes only when a step or its status changes. */
  readonly announcement: string;
}

/** Number of steps in the deposit sequence, fixed by the deposit dialog contract. */
export const DEPOSIT_STEP_COUNT = 5;

const STEP_ORDER: readonly DepositStepId[] = [
  "request",
  "signature",
  "sweep",
  "attestation",
  "settlement",
];

/** User-facing label of each step, fixed by the deposit dialog contract. */
export const DEPOSIT_STEP_LABEL: Record<DepositStepId, string> = {
  request: "Create deposit request on Midnight",
  signature: "Wait for MPC signature",
  sweep: "Submit and confirm the EVM sweep",
  attestation: "Wait for MPC attestation",
  settlement: "Complete deposit on Midnight",
};

const STATUS_LABEL: Record<DepositStepStatus, string> = {
  pending: "Not started",
  active: "In progress",
  complete: "Completed",
  attention: "Needs attention",
};

// Each line names the evidence that completed the step, so a tick and its text say the same thing.
const COMPLETION_DETAIL: Record<DepositStepId, string> = {
  request: "The deposit request is confirmed on the Midnight ledger.",
  signature: "The MPC signed this request's sweep, and that transaction reached the network.",
  sweep: "The sweep transaction is mined.",
  attestation: "The MPC attested the sweep as successful.",
  settlement: "The Midnight settlement is confirmed and the shielded balance is credited.",
};

// A step waits here before any checkpoint describes it, so the line states the prerequisite.
const PENDING_DETAIL: Record<DepositStepId, string | null> = {
  request: null,
  signature: "Starts once the deposit request is confirmed.",
  sweep: "Starts once the MPC has signed the sweep.",
  attestation: "Starts once the sweep is mined.",
  settlement: "Starts once the MPC attestation verifies.",
};

/**
 * @param events - Checkpoints published so far by the running or resumed operation.
 * @returns Which steps have their own completion evidence in hand.
 */
function completedSteps(events: readonly FlowEvent[]): Record<DepositStepId, boolean> {
  const names = new Set(events.map((event) => event.name));
  const attestation = events.find((event) => event.name === "attestation-present");
  return {
    // A resumed or recovered deposit submits no request, so the confirmed checkpoint alone is the
    // evidence that step 1 finished, whether it finished in this run or an earlier one.
    request: names.has("request-confirmed"),
    // A transaction on the network is proof that the validated signed sweep was in hand.
    signature: names.has("evm-broadcast") || names.has("evm-receipt"),
    sweep: names.has("evm-receipt"),
    attestation: attestation?.name === "attestation-present" && attestation.succeeded,
    settlement: names.has("midnight-settled"),
  };
}

/**
 * @param events - Checkpoints published so far.
 * @returns Whether the MPC attested this sweep as failed, which is a proven failure.
 */
function attestedFailure(events: readonly FlowEvent[]): boolean {
  return events.some((event) => event.name === "attestation-present" && !event.succeeded);
}

/**
 * @param id - Step whose completion line is wanted.
 * @param events - Checkpoints published so far.
 * @returns The completion line, naming the observed block where one was published.
 */
function completionDetail(id: DepositStepId, events: readonly FlowEvent[]): string {
  if (id === "sweep") {
    const receipt = events.find((event) => event.name === "evm-receipt");
    if (receipt?.name === "evm-receipt")
      return `The sweep transaction is mined in block ${receipt.evmBlockNumber.toString()}.`;
  }
  if (id === "settlement") {
    const settled = events.find((event) => event.name === "midnight-settled");
    if (settled?.name === "midnight-settled")
      return `The Midnight settlement is confirmed at block ${settled.midnightBlockHeight.toString()} and the shielded balance is credited.`;
  }
  return COMPLETION_DETAIL[id];
}

/**
 * Projects the published checkpoints onto the contract's five steps.
 *
 * A step is ticked only from evidence the operation published for that step, so chain finality,
 * elapsed time and a still-absent MPC response can never complete one. The active step keeps its
 * position when the operation fails, and the steps already proven keep their completion.
 *
 * @param input - Published checkpoints, phase, terminal failure and the derived waiting reason.
 * @param input.events - Checkpoints published so far by the running or resumed operation.
 * @param input.phaseMessage - Progress text labelling a step that no chain read describes yet.
 * @param input.error - Terminal failure message, or null while none has been published.
 * @param input.active - Whether the shared progress owner is running this operation now.
 * @param input.waitHeadline - Task36's derived waiting reason, or null while nothing is awaited.
 * @param input.confirmedRequest - Whether the operation owner retains a ledger-confirmed request
 *   for this token, which is evidence step 1 finished even after the checkpoints are cleared.
 * @param input.settledDeposit - Whether the operation owner reported this deposit settled, which
 *   is evidence every step finished.
 * @returns The five steps with their states, the current step and one live announcement.
 */
export function describeDepositSteps(input: {
  events: readonly FlowEvent[];
  phaseMessage: string | null;
  error: string | null;
  active: boolean;
  waitHeadline: string | null;
  confirmedRequest: boolean;
  settledDeposit: boolean;
}): DepositStepsView {
  const { events, phaseMessage, error, active, waitHeadline } = input;
  const complete = completedSteps(events);
  if (input.confirmedRequest) complete.request = true;
  if (input.settledDeposit) for (const id of STEP_ORDER) complete[id] = true;
  const failedAttestation = attestedFailure(events);
  const current = STEP_ORDER.find((id) => !complete[id]) ?? null;

  const steps = STEP_ORDER.map((id, index): DepositStepView => {
    const position = index + 1;
    if (complete[id])
      return {
        id,
        position,
        label: DEPOSIT_STEP_LABEL[id],
        status: "complete",
        statusLabel: STATUS_LABEL.complete,
        detail: completionDetail(id, events),
      };
    if (id !== current)
      return {
        id,
        position,
        label: DEPOSIT_STEP_LABEL[id],
        status: "pending",
        statusLabel: STATUS_LABEL.pending,
        detail: PENDING_DETAIL[id],
      };
    const needsAttention = error !== null || (id === "attestation" && failedAttestation);
    const status: DepositStepStatus = needsAttention ? "attention" : active ? "active" : "pending";
    const detail = needsAttention
      ? (error ??
        "The MPC attested this sweep as failed, so no shielded balance is credited for it.")
      : status === "active"
        ? (waitHeadline ?? phaseMessage)
        : PENDING_DETAIL[id];
    return {
      id,
      position,
      label: DEPOSIT_STEP_LABEL[id],
      status,
      statusLabel: STATUS_LABEL[status],
      detail,
    };
  });

  const currentStep = steps.find((step) => step.id === current) ?? null;
  const announcement =
    currentStep === null
      ? "Deposit complete. All five steps are finished."
      : `Step ${currentStep.position.toString()} of ${DEPOSIT_STEP_COUNT.toString()}: ${currentStep.label}. ${currentStep.statusLabel}.`;

  return { steps, current, announcement };
}
