import { bytesToHex } from '@sig-net/midnight'
import {
  Action,
  type AttestationRecord,
  type OutputRequestEntry,
  type RequestBufferEntry,
} from '@sig-net/midnight-examples-erc20-vault-contract'

import type {
  RequestLedgerState,
  RequestStage,
} from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import {
  ATTESTATION_BLOCK_HEIGHT,
  IN_INDEX,
  LAST_SEEN,
  MPC_RESPONSE_KEY,
  OUT_INDEX,
  REQUEST_ID,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'

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

/** The ledger holding the fixture request of `vault-request-fixtures.ts` at `stage`, for resolver tests. */
export function requestLedgerAt(
  stage: RequestStage['stage'],
  lastSeen = LAST_SEEN,
): RequestLedgerState {
  const flushed: OutputRequestEntry = { entry: REQUEST_ENTRY, lastSeen }
  const base: Partial<RequestLedgerState> = {
    depositArgsMap: ledgerMap([[IN_INDEX, DEPOSIT_ARGS]]),
    mpcResponseKey: MPC_RESPONSE_KEY,
  }
  switch (stage) {
    case 'queued':
      return requestLedgerState({
        ...base,
        inputRequestBuffer: ledgerMap([[IN_INDEX, REQUEST_ENTRY]]),
      })
    case 'flushed':
      return requestLedgerState({
        ...base,
        outputRequestBuffer: ledgerMap([[OUT_INDEX, flushed]]),
      })
    case 'sent':
      return requestLedgerState({
        ...base,
        outputRequestBuffer: ledgerMap([[OUT_INDEX, flushed]]),
        evictionMap: ledgerMap([[REQUEST_ID, OUT_INDEX]]),
      })
    case 'attestationQueued':
      return requestLedgerState({
        ...base,
        outputRequestBuffer: ledgerMap([[OUT_INDEX, flushed]]),
        evictionMap: ledgerMap([[REQUEST_ID, OUT_INDEX]]),
        inputAttestationBuffer: ledgerMap([[REQUEST_ID, ATTESTATION_RECORD]]),
      })
    case 'attestationFlushed':
      return requestLedgerState({
        ...base,
        outputRequestBuffer: ledgerMap([[OUT_INDEX, flushed]]),
        evictionMap: ledgerMap([[REQUEST_ID, OUT_INDEX]]),
        outputAttestationBuffer: ledgerMap([[REQUEST_ID, ATTESTATION_RECORD]]),
      })
    case 'settled':
      return requestLedgerState({ mpcResponseKey: MPC_RESPONSE_KEY })
    default: {
      const unhandled: never = stage
      throw new Error(`Unhandled stage ${JSON.stringify(unhandled)}`)
    }
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

const REQUEST_ENTRY: RequestBufferEntry = {
  action: Action.deposit,
  useNextVaultAccountNonce: false,
  evmNonce: 7n,
  inIndex: IN_INDEX,
  commitment: new Uint8Array(32),
  argsHash: new Uint8Array(32),
}

const ATTESTATION_RECORD: AttestationRecord = {
  blockHeight: ATTESTATION_BLOCK_HEIGHT,
  outputKind: 0,
  digest: new Uint8Array(32),
}

const DEPOSIT_ARGS = {
  request: { erc20Address: new Uint8Array(20), amount: 1n },
  path: new Uint8Array(32),
  gas: { gasLimit: 1n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
}
