"use client";

import { useEffect, useState } from "react";

import {
  flow,
  type FlowEvent,
  type FlowKind,
  type FlowState,
  PHASE_MESSAGE,
} from "@/lib/midnight/flow";

// A stage can stay active for many minutes, so the elapsed reading is refreshed on its own clock
// while the operation runs. The reading is clamped at zero, so the interval between entering a
// stage and the next tick reads as zero elapsed time.
const ELAPSED_TICK_MS = 1000;

/** Presentation view of the shared operation progress owner. */
export interface MidnightProgress {
  readonly active: boolean;
  /** Operation category owning the shared progress, or null while nothing runs. */
  readonly kind: FlowKind | null;
  readonly message: string;
  readonly error: string | null;
  /** Structured checkpoints published by the running operation, in order. */
  readonly events: readonly FlowEvent[];
  /** Epoch milliseconds at which the current stage began, or null while nothing runs. */
  readonly stageEnteredAt: number | null;
  /** Milliseconds spent in the current stage, or null while nothing runs. */
  readonly stageElapsedMs: number | null;
  /** Epoch milliseconds of the most recent chain read that returned without error. */
  readonly lastObservedAt: number | null;
}

/**
 * Projects operation phases into presentation state, excluding terminal failures from activity.
 *
 * @returns Active progress text, structured checkpoints, stage timing and the current failure.
 */
export function useMidnightProgress(): MidnightProgress {
  const [s, setS] = useState<FlowState>({
    kind: flow.kind,
    phase: flow.phase,
    error: flow.error,
    refunded: flow.refunded,
    events: flow.events,
    stageEnteredAt: flow.stageEnteredAt,
    lastObservedAt: flow.lastObservedAt,
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => flow.subscribe(setS), []);
  // Failed flows retain their phase text, so activity must also check the error.
  const active = !!s.phase && s.phase !== "done" && !s.error;
  const { stageEnteredAt } = s;
  useEffect(() => {
    if (!active || stageEnteredAt === null) return undefined;
    const tick = setInterval(() => {
      setNow(Date.now());
    }, ELAPSED_TICK_MS);
    return () => {
      clearInterval(tick);
    };
  }, [active, stageEnteredAt]);
  return {
    active,
    kind: s.kind,
    message: s.phase ? PHASE_MESSAGE[s.phase] : "Working…",
    error: s.error,
    events: s.events,
    stageEnteredAt,
    stageElapsedMs: stageEnteredAt === null ? null : Math.max(0, now - stageEnteredAt),
    lastObservedAt: s.lastObservedAt,
  };
}
