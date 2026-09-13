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

class Flow {
  kind: FlowKind | null = null;
  phase: FlowPhase | null = null;
  error: string | null = null;
  refunded = false;
  private listeners = new Set<Listener>();

  start(kind: FlowKind): void {
    this.kind = kind;
    this.phase = "preparing";
    this.error = null;
    this.refunded = false;
    this.emit();
  }
  set(phase: FlowPhase): void {
    this.phase = phase;
    this.error = null;
    this.emit();
  }
  fail(message: string): void {
    this.error = message;
    this.emit();
  }
  finishRefunded(): void {
    this.phase = "done";
    this.refunded = true;
    this.emit();
  }
  reset(): void {
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
