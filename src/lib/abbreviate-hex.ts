/** A hex identifier shortened to its first six and last four characters: `0x10B4…6dFa`. */
export function abbreviateHex(hex: string): string {
  return hex.length <= 10 ? hex : `${hex.slice(0, 6)}…${hex.slice(-4)}`
}
