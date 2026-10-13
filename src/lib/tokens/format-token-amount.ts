/** Writes base units as an exact decimal in whole tokens, with no thousands separators and no trailing zeros. */
export function formatTokenAmount(baseUnits: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`Decimals must be a non-negative integer, got ${decimals}.`)
  }
  const sign = baseUnits < 0n ? '-' : ''
  const digits = (baseUnits < 0n ? -baseUnits : baseUnits).toString().padStart(decimals + 1, '0')
  const whole = digits.slice(0, digits.length - decimals)
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '')
  return fraction === '' ? `${sign}${whole}` : `${sign}${whole}.${fraction}`
}
