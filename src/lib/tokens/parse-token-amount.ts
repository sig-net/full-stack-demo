/**
 * Reads a whole-token decimal such as `12.5` into base units, refusing anything that is not a
 * plain decimal or that carries more fraction digits than the token has, so no precision is
 * silently dropped before conversion.
 */
export function parseTokenAmount(text: string, decimals: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text.trim())
  if (match === null) throw new Error('Enter a plain decimal amount, such as 12.5.')
  const whole = match[1] ?? '0'
  const fraction = match[2] ?? ''
  if (fraction.length > decimals) {
    throw new Error(`The amount has more than ${String(decimals)} decimal places.`)
  }
  return BigInt(whole + fraction.padEnd(decimals, '0'))
}
