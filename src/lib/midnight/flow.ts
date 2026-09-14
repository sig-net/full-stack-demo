/** Operation categories sharing the exclusive vault progress owner. */
export type FlowKind = "deposit" | "withdraw" | "swap" | "supply" | "redeem";

/** Progress checkpoints shared by operation code and presentation. */
export type FlowPhase =
  "preparing" | "proving" | "settling" | "claim-proving" | "refunding" | "done";

/** Progress snapshot retaining terminal failure and refund information. */
export interface FlowState {
  kind: FlowKind | null;
  phase: FlowPhase | null;
  error: string | null;
  /** Distinguishes a refunded EVM failure from successful execution. */
  refunded: boolean;
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
  private owner: FlowOwner | null = null;
  private listeners = new Set<Listener>();

  start(kind: FlowKind, owner: FlowOwner): void {
    this.owner = owner;
    this.kind = kind;
    this.phase = "preparing";
    this.error = null;
    this.refunded = false;
    this.emit();
  }
  set(phase: FlowPhase, owner: FlowOwner): void {
    if (this.owner !== owner) return;
    this.phase = phase;
    this.error = null;
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
    this.emit();
  }
  reset(): void {
    this.owner = null;
    this.kind = null;
    this.phase = null;
    this.error = null;
    this.refunded = false;
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
    return { kind: this.kind, phase: this.phase, error: this.error, refunded: this.refunded };
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
}

/** Attested terminal outcome, with exact output units when the circuit returns them. */
export type VaultExecutionResult =
  { status: "settled"; outputUnits: bigint | null } | { status: "refunded" };
