import { parseGwei, type PublicClient } from 'viem';

const FEE_MULTIPLIER = 2n;
const MIN_PRIORITY_FEE = parseGwei('1');

export async function estimateFees(provider: PublicClient): Promise<{
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}> {
  const [block, feeData] = await Promise.all([
    provider.getBlock({ blockTag: 'latest' }),
    provider.estimateFeesPerGas(),
  ]);

  const baseFeePerGas = block.baseFeePerGas ?? parseGwei('30');
  const estimatedPriorityFee = feeData.maxPriorityFeePerGas ?? MIN_PRIORITY_FEE;
  const maxPriorityFeePerGas =
    estimatedPriorityFee > MIN_PRIORITY_FEE
      ? estimatedPriorityFee * FEE_MULTIPLIER
      : MIN_PRIORITY_FEE * FEE_MULTIPLIER;
  const maxFeePerGas = baseFeePerGas * FEE_MULTIPLIER + maxPriorityFeePerGas;

  return { maxFeePerGas, maxPriorityFeePerGas };
}
