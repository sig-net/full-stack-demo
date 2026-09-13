import type * as Ethers from "ethers";
import { afterEach, expect, it, vi } from "vitest";

import {
  discoverSwappablePairs,
  quoteBestFeeExactInput,
  SWAP_READ_TIMEOUT_MS,
} from "@/lib/midnight/evm-swap";

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("ethers", async (original) => {
  const ethers = await original<typeof Ethers>();
  return {
    ...ethers,
    Contract: class {
      getFunction(): typeof call & { staticCall: typeof call } {
        return Object.assign(call, { staticCall: call });
      }
    },
  };
});
afterEach(() => vi.useRealTimers());
const rpc = "http://localhost:8545";
const revert = Object.assign(new Error("no liquidity"), { code: "CALL_EXCEPTION" });

it("retains the best viable tier after other tiers revert or time out", async () => {
  vi.useFakeTimers();
  call.mockImplementation(({ fee }: { fee: bigint }) => {
    if (fee === 100n) return new Promise(() => undefined);
    if (fee === 500n) return Promise.reject(revert);
    return Promise.resolve([fee === 3000n ? 20n : 10n, 0n, 0n, 90000n]);
  });
  const result = quoteBestFeeExactInput(rpc, "in", "out", 10n);
  await vi.advanceTimersByTimeAsync(SWAP_READ_TIMEOUT_MS);
  await expect(result).resolves.toEqual({ fee: 3000n, amountOut: 20n });
});

it("distinguishes no viable pool from RPC failure and bounded timeout", async () => {
  call.mockRejectedValue(revert);
  await expect(quoteBestFeeExactInput(rpc, "in", "out", 10n)).resolves.toBeNull();
  call.mockRejectedValue(new Error("RPC unavailable"));
  await expect(quoteBestFeeExactInput(rpc, "in", "out", 10n)).rejects.toThrow("RPC unavailable");
  vi.useFakeTimers();
  call.mockImplementation(() => new Promise(() => undefined));
  const result = quoteBestFeeExactInput(rpc, "in", "out", 10n).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(SWAP_READ_TIMEOUT_MS);
  expect(await result).toMatchObject({
    message: "EVM RPC read timed out. Check the connection and retry.",
  });
});

it("does not report empty discovery when all factory reads fail", async () => {
  call.mockRejectedValue(new Error("factory unavailable"));
  await expect(discoverSwappablePairs(rpc, ["a", "b"])).rejects.toThrow("factory unavailable");
  call.mockResolvedValue("0x0000000000000000000000000000000000000000");
  await expect(discoverSwappablePairs(rpc, ["a", "b"])).resolves.toEqual(new Set());
});

it("bounds and cancels the whole discovery operation", async () => {
  vi.useFakeTimers();
  call.mockImplementation(() => new Promise(() => undefined));
  const deadline = discoverSwappablePairs(rpc, ["a", "b"]).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(SWAP_READ_TIMEOUT_MS);
  expect(await deadline).toMatchObject({
    message: "EVM RPC read timed out. Check the connection and retry.",
  });
  const controller = new AbortController();
  const cancelled = discoverSwappablePairs(rpc, ["a", "b"], controller.signal).catch(
    (error: unknown) => error,
  );
  controller.abort(new Error("obsolete"));
  expect(await cancelled).toMatchObject({ message: "obsolete" });
});

it("excludes a better-priced tier that exceeds the signed vault gas allowance", async () => {
  call.mockImplementation(({ fee }: { fee: bigint }) =>
    Promise.resolve(fee === 100n ? [64176n, 0n, 0n, 760299n] : [9974n, 0n, 0n, 91788n]),
  );
  await expect(quoteBestFeeExactInput(rpc, "in", "out", 10000n)).resolves.toEqual({
    fee: 500n,
    amountOut: 9974n,
  });
});
