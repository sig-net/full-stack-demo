import { parseUnits } from 'viem';

export function parseTokenAmount(input: string, decimals: number): bigint {
  const amount = input.trim();
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    !/^\d+(\.\d+)?$/.test(amount) ||
    (amount.split('.')[1]?.length ?? 0) > decimals
  )
    throw new Error(
      `Enter a positive amount with at most ${decimals} decimal places.`,
    );
  const units = parseUnits(amount, decimals);
  if (units <= 0n) throw new Error('Enter an amount greater than zero.');
  return units;
}
