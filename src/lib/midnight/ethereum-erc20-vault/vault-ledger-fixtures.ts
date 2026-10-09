import { bytesToHex } from '@sig-net/midnight'

import type { RequestLedgerState } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'

/** A ledger state with empty maps and a placeholder response key, for tests that place one request. */
export function requestLedgerState(
  overrides: Partial<RequestLedgerState> = {},
): RequestLedgerState {
  return {
    inputRequestBuffer: ledgerMap([]),
    outputRequestBuffer: ledgerMap([]),
    inputAttestationBuffer: ledgerMap([]),
    outputAttestationBuffer: ledgerMap([]),
    evictionMap: ledgerMap([]),
    depositArgsMap: ledgerMap([]),
    mpcResponseKey: { x: 1n, y: 2n, identity: false },
    ...overrides,
  }
}

/** A ledger map over the entries given, keyed as the generated maps key: by value, not identity. */
export function ledgerMap<Key extends bigint | Uint8Array, Value>(entries: [Key, Value][]) {
  const keyOf = (key: Key): string => (typeof key === 'bigint' ? key.toString() : bytesToHex(key))
  const byKey = new Map(entries.map(([key, value]) => [keyOf(key), value]))
  return {
    isEmpty: () => byKey.size === 0,
    size: () => BigInt(byKey.size),
    member: (key: Key) => byKey.has(keyOf(key)),
    lookup: (key: Key): Value => {
      const value = byKey.get(keyOf(key))
      if (value === undefined) throw new Error(`no entry under ${keyOf(key)}`)
      return value
    },
    [Symbol.iterator]: () => entries[Symbol.iterator](),
  }
}
