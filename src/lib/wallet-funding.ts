import { z } from "zod";

/** Error payload accepted from local funding endpoints. */
export const fundingErrorSchema = z.object({ error: z.string().optional() });

/** DUST reserve required by the local readiness gate, in ledger units. */
export const MINIMUM_MIDNIGHT_DUST = 10_000_000_000_000_000n;
/** NIGHT grant supplied by the local genesis funding action, in ledger units. */
export const LOCAL_NIGHT_GRANT = 1_000_000_000_000n;
/** Native fee reserve used by the local funding gate, in wei. */
export const MINIMUM_EVM_ETH = 10_000_000_000_000_000n;
/** Native balance target for a local Anvil funding request, in wei. */
export const LOCAL_EVM_ETH_TARGET = 1_000_000_000_000_000_000n;

/**
 * Treats an unavailable DUST balance as unready.
 *
 * @param dust - Observed fee balance in ledger units.
 * @returns Whether the fee reserve reaches the readiness threshold.
 */
export function hasMidnightFees(dust: bigint | undefined): boolean {
  return dust !== undefined && dust >= MINIMUM_MIDNIGHT_DUST;
}

/**
 * Requires both the native fee reserve and one whole USDC for local demo readiness.
 *
 * @param eth - Observed native balance in wei.
 * @param usdc - Observed USDC balance in token base units.
 * @param decimals - Token precision read from its contract.
 * @returns Whether all balances are available and meet their local thresholds.
 */
export function hasLocalEvmFunds(
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
