/** Operation categories sharing the exclusive vault progress owner. */
export type FlowKind = "deposit" | "withdraw" | "swap" | "supply" | "redeem";

/** Progress checkpoints shared by operation code and presentation. */
export type FlowPhase =
  "preparing" | "proving" | "settling" | "claim-proving" | "refunding" | "done";

/**
 * Structured checkpoints of one operation, each named after the evidence that produced it.
 *
 * Every member is published only once its own evidence is in hand, so a consumer may treat the
 * presence of an event as proof of the thing it names. `request-submitted` carries the predicted
 * identifier the circuit call was built from, and `request-confirmed` carries the identifier read
 * back from the ledger, so a surface can tell a provisional identifier from a verified one.
 */
export type FlowEvent =
  | { readonly name: "request-submitted"; readonly predictedRequestId: string }
  | { readonly name: "request-confirmed"; readonly requestId: string }
  | { readonly name: "signature-wait"; readonly requestId: string }
  | { readonly name: "evm-broadcast"; readonly evmTxHash: string }
  | {
      readonly name: "evm-receipt";
      readonly evmTxHash: string;
      readonly evmBlockNumber: number;
    }
  | { readonly name: "attestation-wait"; readonly requestId: string }
  | {
      readonly name: "attestation-present";
      readonly requestId: string;
      readonly succeeded: boolean;
    }
  | {
      readonly name: "midnight-settled";
      readonly midnightTxHash: string;
      readonly midnightBlockHeight: number;
    };

/** Complete set of structured checkpoint names. */
export type FlowEventName = FlowEvent["name"];

/** Progress snapshot retaining terminal failure and refund information. */
export interface FlowState {
  kind: FlowKind | null;
  phase: FlowPhase | null;
  error: string | null;
  /** Distinguishes a refunded EVM failure from successful execution. */
  refunded: boolean;
  /** Structured checkpoints of the running operation, in the order they were published. */
  events: readonly FlowEvent[];
  /** Epoch milliseconds at which the current phase or checkpoint began. */
  stageEnteredAt: number | null;
  /** Epoch milliseconds of the most recent chain read that returned without error. */
  lastObservedAt: number | null;
}

type Listener = (s: FlowState) => void;

/**
 * Identity of the work allowed to publish into the shared progress owner.
 *
 * Object identity is the whole contract: a caller holds its own token and loses the right to
 * publish the moment another caller starts, so an abandoned operation can never overwrite the
 * progress of the one that replaced it.
 */
export type FlowOwner = object;

class Flow {
  kind: FlowKind | null = null;
  phase: FlowPhase | null = null;
  error: string | null = null;
  refunded = false;
  events: readonly FlowEvent[] = [];
  stageEnteredAt: number | null = null;
  lastObservedAt: number | null = null;
  private owner: FlowOwner | null = null;
  private listeners = new Set<Listener>();

  start(kind: FlowKind, owner: FlowOwner): void {
    this.owner = owner;
    this.kind = kind;
    this.phase = "preparing";
    this.error = null;
    this.refunded = false;
    this.events = [];
    this.stageEnteredAt = Date.now();
    this.lastObservedAt = null;
    this.emit();
  }
  set(phase: FlowPhase, owner: FlowOwner): void {
    if (this.owner !== owner) return;
    if (this.phase !== phase) this.stageEnteredAt = Date.now();
    this.phase = phase;
    this.error = null;
    this.emit();
  }
  event(event: FlowEvent, owner: FlowOwner): void {
    if (this.owner !== owner) return;
    this.events = [...this.events, event];
    this.stageEnteredAt = Date.now();
    this.emit();
  }
  observed(owner: FlowOwner): void {
    if (this.owner !== owner) return;
    this.lastObservedAt = Date.now();
    this.emit();
  }
  fail(message: string, owner: FlowOwner): void {
    if (this.owner !== owner) return;
    this.error = message;
    this.emit();
  }
  finishRefunded(owner: FlowOwner): void {
    if (this.owner !== owner) return;
    this.phase = "done";
    this.refunded = true;
    this.stageEnteredAt = Date.now();
    this.emit();
  }
  reset(): void {
    this.owner = null;
    this.kind = null;
    this.phase = null;
    this.error = null;
    this.refunded = false;
    this.events = [];
    this.stageEnteredAt = null;
    this.lastObservedAt = null;
    this.emit();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l(this.snapshot());
    return () => {
      this.listeners.delete(l);
    };
  }
  private snapshot(): FlowState {
    return {
      kind: this.kind,
      phase: this.phase,
      error: this.error,
      refunded: this.refunded,
      events: this.events,
      stageEnteredAt: this.stageEnteredAt,
      lastObservedAt: this.lastObservedAt,
    };
  }
  private emit(): void {
    const s = this.snapshot();
    for (const l of this.listeners) l(s);
  }
}

/** Single progress owner shared by the mutually exclusive vault operations. */
export const flow = new Flow();

/** Complete presentation labels for every operation progress phase. */
export const PHASE_MESSAGE: Record<FlowPhase, string> = {
  preparing: "Preparing…",
  proving: "Generating proof (runs locally, can take minutes)…",
  settling: "MPC signing + settling on Sepolia…",
  "claim-proving": "Generating settlement proof…",
  refunding: "On-chain leg failed. Refunding your tokens…",
  done: "Done",
};

/** Execution checkpoints supplied by the owner of a captured operation. */
export interface OperationProgress {
  set: (phase: Exclude<FlowPhase, "done">) => void;
  event: (event: FlowEvent) => void;
  /** Marks a chain read that returned without error, so a long wait can show its freshness. */
  observed: () => void;
}

/**
 * Attested terminal outcome, with exact output units when the circuit returns them.
 *
 * `midnightTxHash` is the transaction that carried the settling or refunding circuit call, so a
 * record keeps the Midnight leg of the operation alongside its EVM leg.
 */
export type VaultExecutionResult =
  | { status: "settled"; outputUnits: bigint | null; midnightTxHash: string }
  | { status: "refunded"; midnightTxHash: string };
