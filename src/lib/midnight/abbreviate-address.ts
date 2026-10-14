/**
 * Shortens a bech32m Midnight address to its human-readable prefix, the first three and the last
 * three data characters: `mn_addr_stagenet1sq8…h45`. The separator is the last `1`, since the data
 * alphabet has no `1`. A value without a separator keeps its first and last three characters.
 */
export function abbreviateAddress(address: string): string {
  const { prefix, data } = splitAddress(address)
  if (data.length <= 6) return address
  return `${prefix}${data.slice(0, 3)}…${data.slice(-3)}`
}

/**
 * Shortens a bech32m Midnight address to the first six and the last four of its data characters,
 * dropping the prefix: `36sfcu…afex`, as wide as an abbreviated hex address, for a table cell
 * that shows the full address on hover.
 */
export function abbreviateAddressData(address: string): string {
  const { data } = splitAddress(address)
  if (data.length <= 10) return data
  return `${data.slice(0, 6)}…${data.slice(-4)}`
}

/** The prefix up to and including the separator, the last `1`, and the data after it. */
function splitAddress(address: string): { prefix: string; data: string } {
  const separator = address.lastIndexOf('1')
  const prefix = separator === -1 ? '' : address.slice(0, separator + 1)
  return { prefix, data: address.slice(prefix.length) }
}
