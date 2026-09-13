"use client";

import { useEffect, useState } from "react";

import { flow, type FlowState, PHASE_MESSAGE } from "@/lib/midnight/flow";

/**
 * Projects operation phases into presentation state, excluding terminal failures from activity.
 *
 * @returns Active progress text and the current flow failure.
 */
export function useMidnightProgress(): {
  active: boolean;
  message: string;
  error: string | null;
} {
  const [s, setS] = useState<FlowState>({
    kind: flow.kind,
    phase: flow.phase,
    error: flow.error,
    refunded: flow.refunded,
  });
  useEffect(() => flow.subscribe(setS), []);
  return {
    // Failed flows retain their phase text, so activity must also check the error.
    active: !!s.phase && s.phase !== "done" && !s.error,
    message: s.phase ? PHASE_MESSAGE[s.phase] : "Working…",
    error: s.error,
  };
}
