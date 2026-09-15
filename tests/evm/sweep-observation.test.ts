import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import { withEthersProvider } from "@/lib/evm/ethers-provider";
import { readSweepObservation, type SweepObservation } from "@/lib/evm/sweep-observation";

import { type RpcStub, startRpcStub, stubBlockHash } from "./rpc-stub";

const CHAIN_ID = 11155111n;
const SWEEP_HASH = `0x${"cd".repeat(32)}`;
const SWEEP_BLOCK = 11701696;

let stub: RpcStub;

beforeAll(async () => {
  stub = await startRpcStub(CHAIN_ID);
});

afterAll(async () => {
  await stub.close();
});

beforeEach(() => {
  stub.resumeReads();
  stub.setReceipt(null);
  stub.setHead(SWEEP_BLOCK);
  stub.setFinalizedTag({ kind: "rejected" });
  stub.setBlockHash(SWEEP_BLOCK, stubBlockHash(SWEEP_BLOCK));
});

/**
 * @param previous - Last successful read, when the case carries one forward.
 * @param includedBefore - Whether a receipt was already observed and published.
 * @returns One observation read through the real JSON-RPC boundary.
 */
async function observe(
  previous: SweepObservation | null = null,
  includedBefore = false,
): Promise<SweepObservation> {
  return withEthersProvider(stub.url, (provider) =>
    readSweepObservation(provider, { evmTxHash: SWEEP_HASH, includedBefore, previous }),
  );
}

it("reports a broadcast transaction as pending until a receipt exists", async () => {
  const observation = await observe();
  expect(observation.inclusion).toBe("pending");
  expect(observation.blockNumber).toBeNull();
  expect(observation.confirmations).toBeNull();
  expect(observation.finalized).toBeNull();
  expect(observation.headBlockNumber).toBe(SWEEP_BLOCK);
});

it("counts confirmations from the canonical receipt block as the head advances", async () => {
  stub.setReceipt({ blockNumber: SWEEP_BLOCK, blockHash: stubBlockHash(SWEEP_BLOCK) });
  const first = await observe();
  expect(first.inclusion).toBe("included");
  expect(first.blockNumber).toBe(SWEEP_BLOCK);
  expect(first.confirmations).toBe(1);

  stub.setHead(SWEEP_BLOCK + 4);
  const later = await observe(first);
  expect(later.confirmations).toBe(5);
  expect(later.headMovedAt).toBeGreaterThanOrEqual(first.headMovedAt);
});

it("keeps the head-advance time while a slow head stays at the same block", async () => {
  stub.setReceipt({ blockNumber: SWEEP_BLOCK, blockHash: stubBlockHash(SWEEP_BLOCK) });
  const first = await observe();
  const second = await observe(first);
  const third = await observe(second);
  expect(third.headBlockNumber).toBe(first.headBlockNumber);
  expect(third.headMovedAt).toBe(first.headMovedAt);
  expect(third.observedAt).toBeGreaterThanOrEqual(first.observedAt);

  stub.setHead(SWEEP_BLOCK + 1);
  const moved = await observe(third);
  expect(moved.headMovedAt).toBeGreaterThanOrEqual(third.observedAt);
});

it("reports finality lag and then coverage as the finalized head reaches the receipt block", async () => {
  stub.setReceipt({ blockNumber: SWEEP_BLOCK, blockHash: stubBlockHash(SWEEP_BLOCK) });
  stub.setFinalizedTag({ kind: "height", height: SWEEP_BLOCK - 64 });
  const lagging = await observe();
  expect(lagging.finalizedTag).toBe("supported");
  expect(lagging.finalizedBlockNumber).toBe(SWEEP_BLOCK - 64);
  expect(lagging.finalized).toBe(false);

  stub.setHead(SWEEP_BLOCK + 70);
  stub.setFinalizedTag({ kind: "height", height: SWEEP_BLOCK });
  const covered = await observe(lagging);
  expect(covered.finalized).toBe(true);
  expect(covered.finalizedBlockNumber).toBe(SWEEP_BLOCK);
});

it("reports an endpoint that rejects or empties the finalized tag as unsupported", async () => {
  stub.setReceipt({ blockNumber: SWEEP_BLOCK, blockHash: stubBlockHash(SWEEP_BLOCK) });
  const rejected = await observe();
  expect(rejected.finalizedTag).toBe("unsupported");
  expect(rejected.finalizedBlockNumber).toBeNull();
  expect(rejected.finalized).toBeNull();
  expect(rejected.confirmations).toBe(1);

  stub.setFinalizedTag({ kind: "empty" });
  const empty = await observe(rejected);
  expect(empty.finalizedTag).toBe("unsupported");
  expect(empty.finalized).toBeNull();
});

it("withholds finality while the receipt block is not the canonical block", async () => {
  stub.setReceipt({ blockNumber: SWEEP_BLOCK, blockHash: stubBlockHash(SWEEP_BLOCK) });
  stub.setFinalizedTag({ kind: "height", height: SWEEP_BLOCK + 10 });
  const canonical = await observe();
  expect(canonical.finalized).toBe(true);

  stub.setBlockHash(SWEEP_BLOCK, `0x${"ff".repeat(32)}`);
  const reorged = await observe(canonical);
  expect(reorged.inclusion).toBe("reorged");
  expect(reorged.confirmations).toBeNull();
  expect(reorged.finalized).toBeNull();
  expect(reorged.finalizedBlockNumber).toBe(SWEEP_BLOCK + 10);
});

it("reports a receipt that disappears after publication as reorged", async () => {
  stub.setReceipt(null);
  const withPublishedReceipt = await observe(null, true);
  expect(withPublishedReceipt.inclusion).toBe("reorged");

  const withoutEvidence = await observe(null, false);
  expect(withoutEvidence.inclusion).toBe("pending");

  const included: SweepObservation = { ...withPublishedReceipt, inclusion: "included" };
  expect((await observe(included, false)).inclusion).toBe("reorged");
});

it("fails the read while the endpoint is unavailable and recovers on the next read", async () => {
  stub.setReceipt({ blockNumber: SWEEP_BLOCK, blockHash: stubBlockHash(SWEEP_BLOCK) });
  const before = await observe();
  stub.failReads();
  await expect(observe(before)).rejects.toThrow();
  stub.resumeReads();
  const after = await observe(before);
  expect(after.inclusion).toBe("included");
  expect(after.confirmations).toBe(1);
});
