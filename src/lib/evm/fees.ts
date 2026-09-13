import { parseGwei, type PublicClient } from "viem";

const FEE_MULTIPLIER = 2n;
const MIN_PRIORITY_FEE = parseGwei("1");

/**
 * Applies a conservative multiplier and minimum priority fee to the current RPC estimate.
 *
 * @param provider - RPC client used for the latest block and EIP-1559 fee estimate.
 * @returns Maximum fee caps in wei, using a base-fee fallback when the block omits one.
 * @throws {Error} If either RPC request fails.
 */
export async function estimateFees(provider: PublicClient): Promise<{
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}> {
  const [block, feeData] = await Promise.all([
    provider.getBlock({ blockTag: "latest" }),
    provider.estimateFeesPerGas(),
  ]);

  const baseFeePerGas = block.baseFeePerGas ?? parseGwei("30");
  const estimatedPriorityFee = feeData.maxPriorityFeePerGas;
  const maxPriorityFeePerGas =
    estimatedPriorityFee > MIN_PRIORITY_FEE
      ? estimatedPriorityFee * FEE_MULTIPLIER
      : MIN_PRIORITY_FEE * FEE_MULTIPLIER;
  const maxFeePerGas = baseFeePerGas * FEE_MULTIPLIER + maxPriorityFeePerGas;

  return { maxFeePerGas, maxPriorityFeePerGas };
}
