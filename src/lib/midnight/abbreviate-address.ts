/**
 * Shortens a bech32m Midnight address to its human-readable prefix, the first three and the last
 * three data characters: `mn_addr_stagenet1sq8…h45`. The separator is the last `1`, since the data
 * alphabet has no `1`. A value without a separator keeps its first and last three characters.
 */
export function abbreviateAddress(address: string): string {
  const separator = address.lastIndexOf('1')
  const prefix = separator === -1 ? '' : address.slice(0, separator + 1)
  const data = address.slice(prefix.length)
  if (data.length <= 6) return address
  return `${prefix}${data.slice(0, 3)}…${data.slice(-3)}`
}
