import { parseUnits } from "viem";

/**
 * Rejects precision loss before converting a positive decimal amount.
 *
 * @param input - Unrounded decimal text entered by the user.
 * @param decimals - Authoritative token decimals from metadata.
 * @returns Exact positive base-unit amount.
 * @throws {Error} If the input is malformed, non-positive or exceeds token precision.
 */
export function parseTokenAmount(input: string, decimals: number): bigint {
  const amount = input.trim();
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    !/^\d+(\.\d+)?$/.test(amount) ||
    (amount.split(".")[1]?.length ?? 0) > decimals
  )
    throw new Error(`Enter a positive amount with at most ${decimals.toString()} decimal places.`);
  const units = parseUnits(amount, decimals);
  if (units <= 0n) throw new Error("Enter an amount greater than zero.");
  return units;
}
