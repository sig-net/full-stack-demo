import type { GasEnvelope } from '@/lib/midnight/ethereum-erc20-vault/vault-call'

/**
 * The EIP-1559 envelope of every sweep, as the prep repository's deposit flow sets it: a
 * transfer needs under 100 000 gas, and the fork's base fee is a few wei, so 30 gwei with a
 * 1 gwei tip is never below the market.
 */
export const SWEEP_GAS: GasEnvelope = {
  gasLimit: 100_000n,
  maxFeePerGas: 30_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
}

/** The most wei a transaction under the envelope can cost its sender. */
export function gasBudget(gas: GasEnvelope): bigint {
  return gas.gasLimit * gas.maxFeePerGas
}
