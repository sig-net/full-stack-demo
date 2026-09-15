import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import { flow, type FlowEvent, type FlowEventName } from "@/lib/midnight/flow";

const SIX_MINUTES = 6 * 60_000;
const START_OF_RUN = new Date("2026-09-14T09:00:00.000Z");
const REQUEST_ID = "ab".repeat(32);
const EVM_TX_HASH = `0x${"cd".repeat(32)}`;
const MIDNIGHT_TX_HASH = "ef".repeat(32);

const DEPOSIT_CHECKPOINTS: readonly FlowEvent[] = [
  { name: "request-submitted", predictedRequestId: REQUEST_ID },
  { name: "request-confirmed", requestId: REQUEST_ID },
  { name: "signature-wait", requestId: REQUEST_ID },
  { name: "evm-broadcast", evmTxHash: EVM_TX_HASH },
  { name: "evm-receipt", evmTxHash: EVM_TX_HASH, evmBlockNumber: 11701696 },
  { name: "attestation-wait", requestId: REQUEST_ID },
  { name: "attestation-present", requestId: REQUEST_ID, succeeded: true },
  { name: "midnight-settled", midnightTxHash: MIDNIGHT_TX_HASH, midnightBlockHeight: 4321 },
];

// Every checkpoint name must appear in the table above, so a new member cannot ship uncovered.
const COVERED: Record<FlowEventName, true> = {
  "request-submitted": true,
  "request-confirmed": true,
  "signature-wait": true,
  "evm-broadcast": true,
  "evm-receipt": true,
  "attestation-wait": true,
  "attestation-present": true,
  "midnight-settled": true,
};

afterEach(() => {
  flow.reset();
  vi.useRealTimers();
});

it("publishes every deposit checkpoint in order with its evidence", () => {
  const owner = {};
  const names = DEPOSIT_CHECKPOINTS.map((event) => event.name);
  expect(names.length).toBeGreaterThan(0);
  expect(new Set(names)).toEqual(new Set(Object.keys(COVERED)));

  flow.start("deposit", owner);
  expect(flow.events).toEqual([]);
  for (const event of DEPOSIT_CHECKPOINTS) flow.event(event, owner);
  expect(flow.events).toEqual(DEPOSIT_CHECKPOINTS);

  flow.event({ name: "signature-wait", requestId: REQUEST_ID }, {});
  expect(flow.events).toHaveLength(DEPOSIT_CHECKPOINTS.length);

  flow.start("withdraw", owner);
  expect(flow.events).toEqual([]);
});

it("keeps the stage clock running through two six-minute deadlines without sleeping", () => {
  vi.useFakeTimers();
  vi.setSystemTime(START_OF_RUN);
  const owner = {};
  const view = renderHook(() => useMidnightProgress());
  act(() => {
    flow.start("deposit", owner);
    flow.set("settling", owner);
    flow.event({ name: "signature-wait", requestId: REQUEST_ID }, owner);
  });
  const entered = view.result.current.stageEnteredAt;
  expect(entered).toBe(START_OF_RUN.getTime());
  expect(view.result.current.stageElapsedMs).toBe(0);
  expect(view.result.current.lastObservedAt).toBeNull();

  act(() => {
    vi.advanceTimersByTime(SIX_MINUTES);
  });
  expect(view.result.current.stageElapsedMs).toBe(SIX_MINUTES);
  act(() => {
    flow.observed(owner);
  });
  const observed = view.result.current.lastObservedAt;
  expect(observed).toBe(START_OF_RUN.getTime() + SIX_MINUTES);

  act(() => {
    vi.advanceTimersByTime(SIX_MINUTES);
  });
  expect(view.result.current.active).toBe(true);
  expect(view.result.current.stageEnteredAt).toBe(entered);
  expect(view.result.current.stageElapsedMs).toBe(2 * SIX_MINUTES);
  expect(view.result.current.lastObservedAt).toBe(observed);
  expect(view.result.current.events.map((event) => event.name)).toEqual(["signature-wait"]);
  view.unmount();
});

it("restarts the stage clock at each checkpoint and at each phase change", () => {
  vi.useFakeTimers();
  vi.setSystemTime(START_OF_RUN);
  const owner = {};
  const view = renderHook(() => useMidnightProgress());
  act(() => {
    flow.start("deposit", owner);
  });
  act(() => {
    vi.advanceTimersByTime(SIX_MINUTES);
    flow.event({ name: "evm-broadcast", evmTxHash: EVM_TX_HASH }, owner);
  });
  expect(view.result.current.stageEnteredAt).toBe(START_OF_RUN.getTime() + SIX_MINUTES);
  expect(view.result.current.stageElapsedMs).toBe(0);

  act(() => {
    vi.advanceTimersByTime(1000);
    flow.set("settling", owner);
  });
  expect(view.result.current.stageEnteredAt).toBe(START_OF_RUN.getTime() + SIX_MINUTES + 1000);

  act(() => {
    vi.advanceTimersByTime(1000);
    flow.set("settling", owner);
  });
  expect(view.result.current.stageEnteredAt).toBe(START_OF_RUN.getTime() + SIX_MINUTES + 1000);
  expect(view.result.current.stageElapsedMs).toBe(1000);
  view.unmount();
});

it("stops the stage clock once the operation reaches a terminal state", () => {
  vi.useFakeTimers();
  vi.setSystemTime(START_OF_RUN);
  const owner = {};
  const view = renderHook(() => useMidnightProgress());
  act(() => {
    flow.start("deposit", owner);
    flow.set("settling", owner);
  });
  act(() => {
    vi.advanceTimersByTime(1000);
    flow.fail("MPC attested deposit as FAILED", owner);
  });
  const frozen = view.result.current.stageElapsedMs;
  expect(frozen).toBe(1000);
  expect(view.result.current.active).toBe(false);
  act(() => {
    vi.advanceTimersByTime(SIX_MINUTES);
  });
  expect(view.result.current.stageElapsedMs).toBe(frozen);
  expect(view.result.current.error).toBe("MPC attested deposit as FAILED");
  view.unmount();
});
