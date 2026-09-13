import { formatUnits } from "viem";

/** Display rounding and fiat conversion options, independent of transaction base-unit amounts. */
export interface FormatBalanceOptions {
  /** Manual precision override (decimal places to show) */
  precision?: number;
  /** Include token symbol in output */
  showSymbol?: boolean;
  /** Select USD output when usdPrice is supplied. */
  showUsd?: boolean;
  /** USD price per token for conversion */
  usdPrice?: number;
}

function calculateSmartPrecision(numericAmount: number, maxDecimals: number): number {
  if (numericAmount >= 1000) {
    return Math.min(2, maxDecimals);
  } else if (numericAmount >= 1) {
    return Math.min(4, maxDecimals);
  } else if (numericAmount >= 0.01) {
    return Math.min(6, maxDecimals);
  } else if (numericAmount > 0) {
    return Math.min(8, maxDecimals);
  }
  return 2;
}

function formatBalanceCore(
  amount: bigint | string,
  decimals: number,
  symbol: string | undefined,
  options: FormatBalanceOptions = {},
): string {
  const { precision, showSymbol = false, showUsd = false, usdPrice } = options;

  const amountBigInt = typeof amount === "string" ? BigInt(amount) : amount;

  const formattedAmount = formatUnits(amountBigInt, decimals);
  const numericAmount = parseFloat(formattedAmount);

  if (showUsd && typeof usdPrice === "number") {
    const usdValue = numericAmount * usdPrice;
    if (usdValue === 0) return "$0.00";
    if (usdValue < 0.01) return "<$0.01";

    return `$${usdValue.toFixed(2)}`;
  }

  const actualPrecision =
    precision !== undefined
      ? Math.min(precision, decimals)
      : calculateSmartPrecision(numericAmount, decimals);

  let result = numericAmount.toFixed(actualPrecision).replace(/\.?0+$/, "");

  if (!result.includes(".") && numericAmount >= 1000) {
    result = parseInt(result).toLocaleString();
  }

  if (showSymbol && symbol) {
    result = `${result} ${symbol}`;
  }

  return result;
}

/**
 * Produces a rounded display label, with optional fiat conversion and token suffix.
 *
 * @param amount - Exact base units before display-only numeric conversion.
 * @param decimals - Authoritative decimals for the token.
 * @param symbol - The suffix used when showSymbol is enabled.
 * @param options - Display precision and optional USD pricing.
 * @returns A display label that must not be reused as a transaction amount.
 * @throws {SyntaxError | RangeError} If a string amount is not an integer or the requested precision is outside toFixed limits.
 */
export function formatTokenBalanceSync(
  amount: bigint | string,
  decimals: number,
  symbol?: string,
  options: FormatBalanceOptions = {},
): string {
  return formatBalanceCore(amount, decimals, symbol, options);
}
