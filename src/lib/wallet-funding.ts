export const MINIMUM_MIDNIGHT_DUST = 10_000_000_000_000_000n;
export const LOCAL_NIGHT_GRANT = 1_000_000_000_000n;
export const MINIMUM_EVM_ETH = 10_000_000_000_000_000n;
export const LOCAL_EVM_ETH_TARGET = 1_000_000_000_000_000_000n;

export function hasMidnightFees(dust: bigint | undefined): boolean {
  return dust !== undefined && dust >= MINIMUM_MIDNIGHT_DUST;
}

export function hasEvmDepositFunds(
  eth: bigint | undefined,
  usdc: bigint | undefined,
  decimals: number | undefined,
): boolean {
  return (
    eth !== undefined &&
    eth >= MINIMUM_EVM_ETH &&
    usdc !== undefined &&
    decimals !== undefined &&
    usdc >= 10n ** BigInt(decimals)
  );
}
