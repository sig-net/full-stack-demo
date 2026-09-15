import type { MidnightProgress } from "@/hooks/use-midnight-progress";

/**
 * @param overrides - Fields this case cares about.
 * @returns A complete progress reading whose unnamed fields report an idle owner.
 */
export function progressState(overrides: Partial<MidnightProgress> = {}): MidnightProgress {
  return {
    active: false,
    kind: null,
    message: "",
    error: null,
    events: [],
    stageEnteredAt: null,
    stageElapsedMs: null,
    lastObservedAt: null,
    ...overrides,
  };
}
