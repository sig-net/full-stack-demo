import type { JsonRpcProvider } from "ethers";

/** Whether the configured endpoint answers the `finalized` block tag. */
export type FinalizedTagSupport = "supported" | "unsupported";

/** Canonical status of one exact transaction on the configured chain. */
export type SweepInclusion = "pending" | "included" | "reorged";

/** One chain read of a submitted transaction, its depth and the finalized head. */
export interface SweepObservation {
  readonly evmTxHash: string;
  readonly inclusion: SweepInclusion;
  /** Block holding the canonical receipt, retained across a read that loses it. */
  readonly blockNumber: number | null;
  readonly headBlockNumber: number;
  /** Depth of the canonical receipt block counting itself, or null while none is canonical. */
  readonly confirmations: number | null;
  readonly finalizedBlockNumber: number | null;
  /** Whether the canonical receipt block is covered by the finalized head. */
  readonly finalized: boolean | null;
  readonly finalizedTag: FinalizedTagSupport;
  /** Epoch milliseconds at which this read returned. */
  readonly observedAt: number;
  /** Epoch milliseconds at which the head was last seen to advance. */
  readonly headMovedAt: number;
}

/**
 * @param provider - Endpoint that has already answered the reads of this poll.
 * @returns The finalized head height, or null when the endpoint does not serve the tag.
 */
async function readFinalizedHead(provider: JsonRpcProvider): Promise<number | null> {
  try {
    const block = await provider.getBlock("finalized");
    return block?.number ?? null;
  } catch {
    // The endpoint answered the receipt and head reads of this same poll, so a rejected
    // `finalized` tag is a capability limit of the endpoint and not a transport failure.
    return null;
  }
}

/**
 * Reads one transaction's canonical inclusion, depth and finalized coverage.
 *
 * Inclusion is rechecked against the canonical block at the receipt's own height, so a receipt
 * whose block has been replaced reports `reorged` with no depth. A receipt that disappears after
 * the caller has already observed one reports `reorged` too, which is why the caller passes
 * `includedBefore` from its own published evidence.
 *
 * @param provider - Captured endpoint for this chain.
 * @param input - Transaction identity, prior inclusion evidence and the previous read.
 * @param input.evmTxHash - Exact transaction being observed.
 * @param input.includedBefore - Whether a receipt for this transaction was already observed.
 * @param input.previous - Last successful read, supplying head-advance timing and the known block.
 * @returns The observation produced by this read.
 * @throws {Error} If the receipt, head or canonical block reads fail.
 */
export async function readSweepObservation(
  provider: JsonRpcProvider,
  input: {
    evmTxHash: string;
    includedBefore: boolean;
    previous: SweepObservation | null;
  },
): Promise<SweepObservation> {
  const { evmTxHash, includedBefore, previous } = input;
  const [receipt, headBlockNumber] = await Promise.all([
    provider.getTransactionReceipt(evmTxHash),
    provider.getBlockNumber(),
  ]);
  const finalizedBlockNumber = await readFinalizedHead(provider);
  const observedAt = Date.now();

  let inclusion: SweepInclusion;
  if (receipt === null) {
    const observedInclusion = includedBefore || previous?.inclusion === "included";
    inclusion = observedInclusion ? "reorged" : "pending";
  } else {
    const canonical = await provider.getBlock(receipt.blockNumber);
    inclusion = canonical !== null && canonical.hash === receipt.blockHash ? "included" : "reorged";
  }

  const blockNumber = receipt?.blockNumber ?? previous?.blockNumber ?? null;
  const canonicalBlock = inclusion === "included" ? blockNumber : null;
  return {
    evmTxHash,
    inclusion,
    blockNumber,
    headBlockNumber,
    confirmations:
      canonicalBlock === null ? null : Math.max(1, headBlockNumber - canonicalBlock + 1),
    finalizedBlockNumber,
    finalized:
      canonicalBlock === null || finalizedBlockNumber === null
        ? null
        : canonicalBlock <= finalizedBlockNumber,
    finalizedTag: finalizedBlockNumber === null ? "unsupported" : "supported",
    observedAt,
    headMovedAt:
      previous !== null && previous.headBlockNumber === headBlockNumber
        ? previous.headMovedAt
        : observedAt,
  };
}
