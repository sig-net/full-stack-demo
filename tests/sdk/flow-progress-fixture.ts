import type { FlowEvent, FlowPhase, OperationProgress } from "@/lib/midnight/flow";

/** Checkpoint sink retaining everything one captured operation publishes, in order. */
export interface ProgressRecorder {
  readonly progress: OperationProgress;
  readonly phases: readonly Exclude<FlowPhase, "done">[];
  readonly events: readonly FlowEvent[];
  /** @returns How many chain reads have returned without error so far. */
  observationCount: () => number;
  /** @returns The published checkpoint names, in order. */
  eventNames: () => FlowEvent["name"][];
}

/**
 * @returns A progress sink and the live record of the phases, checkpoints and reads it received.
 */
export function createProgressRecorder(): ProgressRecorder {
  const phases: Exclude<FlowPhase, "done">[] = [];
  const events: FlowEvent[] = [];
  let observations = 0;
  return {
    progress: {
      set: (phase) => {
        phases.push(phase);
      },
      event: (event) => {
        events.push(event);
      },
      observed: () => {
        observations += 1;
      },
    },
    phases,
    events,
    observationCount: () => observations,
    eventNames: () => events.map((event) => event.name),
  };
}
